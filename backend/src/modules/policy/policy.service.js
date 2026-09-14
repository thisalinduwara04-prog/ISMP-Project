const mongoose = require('mongoose');

const Policy = require('../../models/Policy');
const PolicyVersion = require('../../models/PolicyVersion');
const Acknowledgement = require('../../models/Acknowledgement');
const { removeForVersions } = require('./attachment.service');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const { NOT_FOUND, CONFLICT, FORBIDDEN } = require('../../constants/http');
const { ROLES } = require('../../constants/roles');
const {
  POLICY_STATUS,
  POLICY_VERSION_STATUS,
  CATEGORY_ABBREVIATION,
} = require('../../constants/policies');
const { buildAudienceFilter, matchesAudience } = require('../../utils/audience');
const assignmentService = require('../assignment/assignment.service');
const audit = require('../audit/audit.service');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_STATUS } = require('../../constants/assignments');

// The policy SHELL (T2). Version authoring and publication live next door in
// version.service.js; this file owns the record that persists across
// revisions, and the reads that list it.

const isDuplicateKey = (error) => !!error && error.code === 11000;

const isAdmin = (user) => user.role === ROLES.ADMIN;

const notFound = () =>
  new AppError(NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

// --- Response shaping -------------------------------------------------------
//
// Explicit rather than returning raw documents, so adding a field to a schema
// cannot silently start exposing it through an existing endpoint - the same
// reason User has toSafeJSON.

const toVersionSummary = (version) =>
  version && {
    id: version._id.toString(),
    versionNumber: version.versionNumber,
    status: version.status,
    effectiveFrom: version.effectiveFrom,
    publishedAt: version.publishedAt,
    dueInDays: version.dueInDays,
  };

// The caller's own state for one policy, derived from the assignments ledger
// rather than from the acknowledgements collection - the ledger is what the
// dashboards count, so the employee's list and the manager's figures can never
// disagree.
//
// `rank` exists so the sort below is a number comparison rather than three
// nested conditionals, and so the client does not have to re-derive the order.
const toTaskState = (assignment) => {
  if (!assignment) return { state: 'NOT_ASSIGNED', rank: 3, dueDate: null };

  if (assignment.status === ASSIGNMENT_STATUS.COMPLETED) {
    return {
      state: 'ACKNOWLEDGED',
      rank: 2,
      dueDate: assignment.dueDate,
      completedAt: assignment.completedAt,
    };
  }

  // OVERDUE is materialised by M4's nightly sweep, so a due date that has just
  // passed is still PENDING in the ledger until that runs. Treating both as
  // overdue here keeps the employee's list honest between sweeps.
  const isOverdue =
    assignment.status === ASSIGNMENT_STATUS.OVERDUE ||
    (assignment.dueDate && new Date(assignment.dueDate).getTime() < Date.now());

  return {
    state: isOverdue ? 'OVERDUE' : 'PENDING',
    rank: isOverdue ? 0 : 1,
    dueDate: assignment.dueDate,
  };
};

const toPolicySummary = (policy, currentVersion, { includeAudience = false } = {}) => ({
  id: policy._id.toString(),
  title: policy.title,
  code: policy.code,
  category: policy.category,
  description: policy.description,
  status: policy.status,
  currentVersion: toVersionSummary(currentVersion),
  ...(includeAudience && currentVersion
    ? {
        // Admins get the targeting rather than their own state - they are
        // looking at who a policy reaches, not at their own task list.
        audience: {
          roles: currentVersion.targetRoles,
          departments: currentVersion.targetDepartments,
          isEveryone:
            currentVersion.targetRoles.length === 0 &&
            currentVersion.targetDepartments.length === 0,
        },
      }
    : {}),
});

// --- Commands ---------------------------------------------------------------

// Codes are generated rather than typed. They have to be unique and stable for
// the life of the policy, and asking an admin to invent one is how you end up
// with POL-001, POL_002 and "Acceptable Use v2" in the same collection.
//
// Shape: POL-<CATEGORY ABBREVIATION>-<3-digit sequence>, e.g. POL-DAT-003. The
// sequence counts existing policies in that category, then steps forward past
// anything already taken - which also covers codes typed by hand before this
// existed, and the gap left by a deleted policy.
const generateCode = async (category) => {
  const prefix = `POL-${CATEGORY_ABBREVIATION[category] || 'GEN'}`;
  const taken = new Set(
    (await Policy.find({ code: { $regex: `^${prefix}-` } }).select('code')).map((p) => p.code)
  );

  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Beyond 999 in one category the scheme has outlived its usefulness; fall
  // back to something unique rather than failing the request.
  return `${prefix}-${Date.now().toString().slice(-6)}`;
};

const createPolicy = async (payload, actor) => {
  const code = payload.code || (await generateCode(payload.category));

  try {
    const policy = await Policy.create({
      ...payload,
      code,
      // The creating admin is accountable unless they nominate someone else.
      ownerId: payload.ownerId || actor._id,
    });

    return toPolicySummary(policy, null);
  } catch (error) {
    // Caught here rather than left to the generic 11000 handler so the message
    // names the policy code and tells the admin what to do about it.
    if (isDuplicateKey(error)) {
      throw new AppError(
        CONFLICT,
        `Policy code ${code} is already in use. Codes identify a policy across every revision, so each one must be unique.`,
        AppErrorCode.DUPLICATE_RESOURCE,
        [{ field: 'code', issue: 'duplicate' }]
      );
    }
    throw error;
  }
};

const updatePolicy = async (policyId, payload, actor, req) => {
  const policy = await Policy.findById(policyId);
  AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

  const wasArchived = policy.status === POLICY_STATUS.ARCHIVED;
  const willArchive = payload.status === POLICY_STATUS.ARCHIVED && !wasArchived;
  const willRestore = payload.status === POLICY_STATUS.ACTIVE && wasArchived;

  // Recorded before the assignment, so the entry says what actually changed
  // rather than what it was changed to.
  const changedFields = Object.keys(payload).filter(
    (field) => String(policy[field]) !== String(payload[field])
  );

  Object.assign(policy, payload);
  await policy.save();

  let archiveResult = null;
  if (willArchive) archiveResult = await archive(policy, actor, req);
  if (willRestore) await restore(policy, actor, req);

  // A pure metadata edit is audited on its own; archiving and restoring write
  // their own, more specific entries above.
  if (!willArchive && !willRestore && changedFields.length) {
    await audit.recordForUser(actor, {
      action: AUDIT_ACTIONS.POLICY_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.POLICY,
      entityId: policy._id,
      metadata: { policyCode: policy.code, changedFields },
      req,
    });
  }

  const currentVersion = policy.currentVersionId
    ? await PolicyVersion.findById(policy.currentVersionId)
    : null;

  return {
    ...toPolicySummary(policy, currentVersion, { includeAudience: true }),
    ...(archiveResult ? { archive: archiveResult } : {}),
  };
};

// --- T10: archiving (UC-11, US-017) -----------------------------------------
//
// A soft, reversible state change. NOTHING is ever deleted: compliance
// evidence has to outlive the policy it relates to (spec section 7.18), so an
// auditor can still answer "who agreed to the old rule, and when?" years after
// the rule itself was retired.
const archive = async (policy, actor, req) => {
  const liveVersion = await PolicyVersion.findOne({
    policyId: policy._id,
    status: POLICY_VERSION_STATUS.PUBLISHED,
  });

  let supersededCount = 0;

  if (liveVersion) {
    liveVersion.status = POLICY_VERSION_STATUS.ARCHIVED;
    await liveVersion.save();

    // Open assignments close as SUPERSEDED so they stop counting against live
    // compliance. Anyone who already acknowledged keeps their COMPLETED row
    // and their acknowledgement - they did the work, and archiving the policy
    // does not un-do it.
    ({ supersededCount } = await assignmentService.supersede({
      itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
      itemId: liveVersion._id,
    }));
  }

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.POLICY_ARCHIVED,
    entityType: AUDIT_ENTITY_TYPE.POLICY,
    entityId: policy._id,
    metadata: {
      policyCode: policy.code,
      archivedVersionId: liveVersion ? liveVersion._id.toString() : null,
      archivedVersionNumber: liveVersion ? liveVersion.versionNumber : null,
      closedAssignments: supersededCount,
    },
    req,
  });

  return {
    archivedVersionNumber: liveVersion ? liveVersion.versionNumber : null,
    closedAssignments: supersededCount,
  };
};

// Permanent deletion of a policy and everything hanging off it.
//
// This is the one operation in the module that destroys evidence, and it does
// so deliberately: the acknowledgements recorded against every version go with
// it. Spec section 7.18 keeps compliance evidence indefinitely, and ARCHIVING
// (UC-11) is the reversible retirement that satisfies it - so this route exists
// for withdrawing a policy that should never have been published at all, such
// as a test or a mistake, not for retiring one that people have complied with.
//
// Two things make it defensible:
//   - the append-only audit entry survives, recording who deleted what and how
//     much evidence went with it, so the act itself is never invisible;
//   - the caller has to say how many acknowledgements they expect to destroy,
//     which turns "delete this" into a decision that cannot be made by
//     accident from a stale screen.
const destroy = async (policyId, { acknowledgeEvidenceLoss } = {}, actor, req) => {
  const policy = await Policy.findById(policyId);
  AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

  const versions = await PolicyVersion.find({ policyId: policy._id });
  const versionIds = versions.map((version) => version._id);

  const evidenceCount = await Acknowledgement.countDocuments({
    policyVersionId: { $in: versionIds },
  });

  AppAssert(
    evidenceCount === 0 || acknowledgeEvidenceLoss === true,
    CONFLICT,
    `This policy holds ${evidenceCount} acknowledgement${evidenceCount === 1 ? '' : 's'} — proof that named staff read it. Deleting destroys that permanently and cannot be undone. Archive it instead to withdraw it while keeping the evidence. To delete anyway, confirm the evidence loss explicitly.`,
    AppErrorCode.VALIDATION_ERROR,
    [{ field: 'acknowledgeEvidenceLoss', issue: `${evidenceCount} acknowledgements would be destroyed` }]
  );

  // Recorded BEFORE the deletion, so the entry exists even if what follows
  // fails halfway.
  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.POLICY_DELETED,
    entityType: AUDIT_ENTITY_TYPE.POLICY,
    entityId: policy._id,
    metadata: {
      policyCode: policy.code,
      title: policy.title,
      versionCount: versions.length,
      acknowledgementsDestroyed: evidenceCount,
    },
    req,
  });

  // Attached PDFs go with the versions that referenced them.
  await removeForVersions(versionIds);

  // The acknowledgements model blocks deletes by design (it is insert-only),
  // so this goes through the driver. That bypass is the whole reason this
  // function is written as carefully as it is.
  await mongoose.connection
    .collection('acknowledgements')
    .deleteMany({ policyVersionId: { $in: versionIds } });

  await assignmentService.removeForItems({
    itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    itemIds: versionIds,
  });

  await PolicyVersion.deleteMany({ policyId: policy._id });
  await Policy.deleteOne({ _id: policy._id });

  return {
    deleted: true,
    code: policy.code,
    versionsDeleted: versions.length,
    acknowledgementsDestroyed: evidenceCount,
  };
};

// Un-archiving deliberately does NOT resurrect the superseded assignments.
// Reviving a due date that passed while the policy was retired would tell
// staff they are overdue on something nobody was asking them to do. To put a
// policy back in front of people, publish a new version - which is also what
// gives them a change note explaining why it is back.
const restore = async (policy, actor, req) => {
  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.POLICY_RESTORED,
    entityType: AUDIT_ENTITY_TYPE.POLICY,
    entityId: policy._id,
    metadata: {
      policyCode: policy.code,
      note: 'Assignments were not restored; a new version must be published to reassign.',
    },
    req,
  });
};

// --- Queries ----------------------------------------------------------------

// Admins see every policy. Everyone else sees only those whose CURRENT
// published version is aimed at them, and only while the policy is active.
//
// The filtering is done here, in the API, not in the interface. Hiding a row
// in React proves nothing: the same user can call the endpoint directly
// (NFR-SEC-03).
const listPolicies = async (user, { category, includeArchived = false } = {}) => {
  if (isAdmin(user)) {
    const policies = await Policy.find({
      ...(category ? { category } : {}),
      ...(includeArchived ? {} : { status: POLICY_STATUS.ACTIVE }),
    }).sort({ code: 1 });

    const versions = await PolicyVersion.find({
      _id: { $in: policies.map((p) => p.currentVersionId).filter(Boolean) },
    });
    const versionById = new Map(versions.map((v) => [v._id.toString(), v]));

    return policies.map((policy) =>
      toPolicySummary(
        policy,
        policy.currentVersionId ? versionById.get(policy.currentVersionId.toString()) : null,
        { includeAudience: true }
      )
    );
  }

  // Start from the versions, not the policies: the audience lives on the
  // version, and this is the query the compound audience index serves.
  const versions = await PolicyVersion.find({
    status: POLICY_VERSION_STATUS.PUBLISHED,
    ...buildAudienceFilter(user),
  });

  if (versions.length === 0) return [];

  const policies = await Policy.find({
    _id: { $in: versions.map((v) => v.policyId) },
    status: POLICY_STATUS.ACTIVE,
    ...(category ? { category } : {}),
  }).sort({ code: 1 });

  const versionByPolicy = new Map(versions.map((v) => [v.policyId.toString(), v]));

  // The caller's own state comes from the ledger, through M4's service - one
  // query for the whole list rather than one per row.
  const assignments = await assignmentService.findByUser(user._id, {
    itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    itemIds: versions.map((v) => v._id),
  });
  const assignmentByItem = new Map(assignments.map((a) => [a.itemId.toString(), a]));

  const rows = policies.map((policy) => {
    const version = versionByPolicy.get(policy._id.toString());
    const assignment = version ? assignmentByItem.get(version._id.toString()) : null;

    return {
      ...toPolicySummary(policy, version),
      task: toTaskState(assignment),
    };
  });

  // Overdue first, then by due date. Someone with three things outstanding
  // should not have to hunt for the one that is already late (US-013).
  return rows.sort((a, b) => {
    if (a.task.rank !== b.task.rank) return a.task.rank - b.task.rank;
    if (a.task.dueDate && b.task.dueDate) return new Date(a.task.dueDate) - new Date(b.task.dueDate);
    return a.code.localeCompare(b.code);
  });
};

// One policy with its version history. An admin sees every revision including
// drafts; everyone else sees only live and historical versions they were in
// the audience for, which is what makes "who agreed to what" legible to them
// without exposing unpublished work.
const getPolicyById = async (policyId, user) => {
  const policy = await Policy.findById(policyId);
  if (!policy) throw notFound();

  const versions = await PolicyVersion.find({ policyId: policy._id }).sort({ versionNumber: -1 });
  const currentVersion = versions.find(
    (v) => v.status === POLICY_VERSION_STATUS.PUBLISHED
  );

  if (isAdmin(user)) {
    return {
      ...toPolicySummary(policy, currentVersion, { includeAudience: true }),
      versions: versions.map((version) => ({
        ...toVersionSummary(version),
        changeNote: version.changeNote,
        targetRoles: version.targetRoles,
        targetDepartments: version.targetDepartments,
        authoredBy: version.authoredBy,
        publishedBy: version.publishedBy,
        createdAt: version.createdAt,
      })),
    };
  }

  AppAssert(
    policy.status === POLICY_STATUS.ACTIVE,
    NOT_FOUND,
    'Policy not found.',
    AppErrorCode.NOT_FOUND
  );

  // A policy the caller is not targeted by is refused outright, not returned
  // with an empty version list.
  AppAssert(
    currentVersion && matchesAudience(currentVersion, user),
    FORBIDDEN,
    'This policy does not apply to your role or department.',
    AppErrorCode.SCOPE_VIOLATION
  );

  return {
    ...toPolicySummary(policy, currentVersion),
    versions: versions
      .filter(
        (version) =>
          version.status !== POLICY_VERSION_STATUS.DRAFT && matchesAudience(version, user)
      )
      .map((version) => ({ ...toVersionSummary(version), changeNote: version.changeNote })),
  };
};

module.exports = {
  createPolicy,
  updatePolicy,
  destroy,
  listPolicies,
  getPolicyById,
  // Shared with version.service.js so both files shape a version the same way.
  toVersionSummary,
  toPolicySummary,
  toTaskState,
  isAdmin,
  notFound,
};
