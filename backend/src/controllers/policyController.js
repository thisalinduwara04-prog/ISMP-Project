const Policy = require('../models/Policy');
const PolicyAcknowledgment = require('../models/PolicyAcknowledgment');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { POLICY_STATUS } = require('../config/constants');

// Helper: does this policy apply to the given user's role?
function appliesToRole(policy, role) {
  return !policy.targetRoles.length || policy.targetRoles.includes(role);
}

// GET /api/policies
// Employees see published policies relevant to their role.
// Admins can pass ?all=true to see every policy including drafts/archived.
const listPolicies = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const wantsAll = isAdmin && req.query.all === 'true';

  const filter = wantsAll ? {} : { status: POLICY_STATUS.PUBLISHED };
  const policies = await Policy.find(filter).sort({ updatedAt: -1 });

  const visible = wantsAll ? policies : policies.filter((p) => appliesToRole(p, req.user.role));

  // Attach whether the current user has acknowledged the current version.
  const acks = await PolicyAcknowledgment.find({
    user: req.user._id,
    policy: { $in: visible.map((p) => p._id) },
  });
  const ackKey = (policyId, version) => `${policyId}:${version}`;
  const ackSet = new Set(acks.map((a) => ackKey(a.policy.toString(), a.versionNumber)));

  const result = visible.map((p) => {
    const cv = p.currentVersion;
    return {
      id: p._id,
      title: p.title,
      category: p.category,
      description: p.description,
      status: p.status,
      targetRoles: p.targetRoles,
      currentVersionNumber: cv ? cv.versionNumber : null,
      updatedAt: p.updatedAt,
      acknowledged: cv ? ackSet.has(ackKey(p._id.toString(), cv.versionNumber)) : false,
    };
  });

  res.json({ policies: result });
});

// GET /api/policies/:id
const getPolicy = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id).populate('versions.publishedBy', 'name employeeId');
  if (!policy) throw new AppError('Policy not found.', 404);

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin) {
    if (policy.status !== POLICY_STATUS.PUBLISHED || !appliesToRole(policy, req.user.role)) {
      throw new AppError('Policy not found.', 404);
    }
  }

  const ack = policy.currentVersion
    ? await PolicyAcknowledgment.findOne({
        policy: policy._id,
        versionNumber: policy.currentVersion.versionNumber,
        user: req.user._id,
      })
    : null;

  res.json({ policy, acknowledged: !!ack });
});

// POST /api/policies (admin) - creates a policy with its first version.
const createPolicy = asyncHandler(async (req, res) => {
  const { title, category, description, targetRoles, content, status } = req.body;

  const policy = await Policy.create({
    title,
    category,
    description,
    targetRoles,
    status,
    createdBy: req.user._id,
    versions: [
      {
        versionNumber: 1,
        content,
        changeNotes: 'Initial version',
        publishedBy: req.user._id,
      },
    ],
  });

  res.status(201).json({ policy });
});

// PATCH /api/policies/:id (admin) - update metadata (title/category/status/targetRoles).
const updatePolicyMeta = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id);
  if (!policy) throw new AppError('Policy not found.', 404);

  Object.assign(policy, req.body);
  await policy.save();
  res.json({ policy });
});

// POST /api/policies/:id/versions (admin) - publish a new content version.
// Publishing a new version means every employee must re-acknowledge it;
// we don't delete old acknowledgments (they remain a historical audit
// trail for the version they were made against).
const addPolicyVersion = asyncHandler(async (req, res) => {
  const { content, changeNotes } = req.body;
  const policy = await Policy.findById(req.params.id);
  if (!policy) throw new AppError('Policy not found.', 404);

  const nextVersion = policy.versions.length
    ? policy.versions[policy.versions.length - 1].versionNumber + 1
    : 1;

  policy.versions.push({
    versionNumber: nextVersion,
    content,
    changeNotes,
    publishedBy: req.user._id,
  });
  policy.status = POLICY_STATUS.PUBLISHED;
  await policy.save();

  res.status(201).json({ policy });
});

// POST /api/policies/:id/acknowledge
const acknowledgePolicy = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id);
  if (!policy) throw new AppError('Policy not found.', 404);
  if (policy.status !== POLICY_STATUS.PUBLISHED || !policy.currentVersion) {
    throw new AppError('This policy is not currently published.', 400);
  }

  try {
    const ack = await PolicyAcknowledgment.create({
      policy: policy._id,
      versionNumber: policy.currentVersion.versionNumber,
      user: req.user._id,
    });
    res.status(201).json({ acknowledgment: ack });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json({ message: 'Already acknowledged.' });
    }
    throw err;
  }
});

// DELETE /api/policies/:id (admin) - archive rather than hard-delete, to
// preserve the acknowledgment audit trail.
const archivePolicy = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id);
  if (!policy) throw new AppError('Policy not found.', 404);
  policy.status = POLICY_STATUS.ARCHIVED;
  await policy.save();
  res.json({ policy });
});

module.exports = {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicyMeta,
  addPolicyVersion,
  acknowledgePolicy,
  archivePolicy,
};
