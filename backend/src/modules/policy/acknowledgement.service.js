const Policy = require('../../models/Policy');
const PolicyVersion = require('../../models/PolicyVersion');
const Acknowledgement = require('../../models/Acknowledgement');
const AuditLog = require('../../models/AuditLog');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const audit = require('../audit/audit.service');
const assignmentService = require('../assignment/assignment.service');
const { matchesAudience } = require('../../utils/audience');
const { NOT_FOUND, FORBIDDEN, CONFLICT, GONE } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_STATUS } = require('../../constants/assignments');
const { POLICY_STATUS, POLICY_VERSION_STATUS } = require('../../constants/policies');

// T6 - recording an acknowledgement (UC-10).
//
// This is the legal artefact the whole platform exists to produce, so the code
// is written for correctness rather than convenience. Three properties matter
// more than anything else here:
//
//   1. It is INSERT-ONLY. Nothing in the system updates or deletes one.
//   2. It is IDEMPOTENT. A double submit returns the first record, and the
//      unique index is what makes that true rather than a check-then-write.
//   3. Its numbers are DERIVED, not accepted. Time spent reading comes from
//      the server's own POLICY_VIEWED event; the IP comes from the connection.

const isDuplicateKey = (error) => !!error && error.code === 11000;

const toAcknowledgementView = (acknowledgement) => ({
  id: acknowledgement._id.toString(),
  policyVersionId: acknowledgement.policyVersionId.toString(),
  versionNumber: acknowledgement.versionNumber,
  acknowledgedAt: acknowledgement.acknowledgedAt,
  timeSpentSeconds: acknowledgement.timeSpentSeconds,
});

// How long the reader actually had the document open, taken from the
// POLICY_VIEWED entry this session wrote when they opened it. Null when there
// is no such event - the value is evidence, so an honest gap beats a guess.
const deriveReadingTime = async (userId, versionId, acknowledgedAt) => {
  const viewEvent = await AuditLog.findOne({
    actorId: userId,
    action: AUDIT_ACTIONS.POLICY_VIEWED,
    entityId: versionId,
  }).sort({ timestamp: -1 });

  if (!viewEvent) return { viewOpenedAt: null, timeSpentSeconds: null };

  return {
    viewOpenedAt: viewEvent.timestamp,
    timeSpentSeconds: Math.max(
      0,
      Math.round((acknowledgedAt.getTime() - viewEvent.timestamp.getTime()) / 1000)
    ),
  };
};

const acknowledge = async (policyId, versionId, user, req) => {
  const policy = await Policy.findById(policyId);
  AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

  const version = await PolicyVersion.findOne({ _id: versionId, policyId });
  AppAssert(version, NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);

  // --- Exception flows, in the order UC-10 lists them --------------------

  // 5b. Archived mid-read. 410 Gone is the honest code: the document existed,
  // the obligation no longer does, and the client removes the item rather than
  // retrying.
  if (
    version.status === POLICY_VERSION_STATUS.ARCHIVED ||
    policy.status === POLICY_STATUS.ARCHIVED
  ) {
    throw new AppError(
      GONE,
      'This policy has been withdrawn and no longer needs to be acknowledged.',
      AppErrorCode.NOT_FOUND
    );
  }

  // 5a. A newer version was published while the page was open. Acknowledging
  // the old wording now would record agreement to text that is no longer in
  // force, so it is refused and the client reloads.
  if (
    version.status !== POLICY_VERSION_STATUS.PUBLISHED ||
    !policy.currentVersionId ||
    policy.currentVersionId.toString() !== version._id.toString()
  ) {
    throw new AppError(
      CONFLICT,
      'This policy has been updated since you opened it. Please read the new version and acknowledge that instead.',
      AppErrorCode.DUPLICATE_RESOURCE
    );
  }

  AppAssert(
    matchesAudience(version, user),
    FORBIDDEN,
    'This policy does not apply to your role or department.',
    AppErrorCode.SCOPE_VIOLATION
  );

  // The assignment is the obligation. Without one there is nothing to close,
  // and an acknowledgement would be evidence of work nobody asked for.
  const assignments = await assignmentService.findByUser(user._id, {
    itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    itemIds: [version._id],
  });
  const assignment = assignments[0] || null;

  AppAssert(
    assignment && assignment.status !== ASSIGNMENT_STATUS.SUPERSEDED,
    FORBIDDEN,
    'This policy has not been assigned to you.',
    AppErrorCode.SCOPE_VIOLATION
  );

  // --- The write --------------------------------------------------------

  const acknowledgedAt = new Date();
  const { viewOpenedAt, timeSpentSeconds } = await deriveReadingTime(
    user._id,
    version._id,
    acknowledgedAt
  );

  let acknowledgement;
  let alreadyRecorded = false;

  try {
    acknowledgement = await Acknowledgement.create({
      userId: user._id,
      policyId: policy._id,
      policyVersionId: version._id,
      versionNumber: version.versionNumber,
      acknowledgedAt,
      viewOpenedAt,
      timeSpentSeconds,
      // Correct behind a proxy because `trust proxy` is set for production in
      // middleware/security.js - read from req.ip rather than from the socket.
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
      assignmentId: assignment._id,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;

    // 6a. Already acknowledged. Handled by CATCHING the unique-index violation
    // rather than by checking first: a findOne-then-insert leaves a window in
    // which two concurrent submits both pass the check. The index has no such
    // window, so the duplicate error IS the check.
    acknowledgement = await Acknowledgement.findOne({
      userId: user._id,
      policyVersionId: version._id,
    });
    alreadyRecorded = true;
  }

  // Through the service - the ledger belongs to M4 (NFR-MNT-01). Idempotent,
  // so the repeat path above does not move the completion timestamp.
  await assignmentService.complete({
    userId: user._id,
    itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    itemId: version._id,
    completionRef: acknowledgement._id,
    completedAt: acknowledgement.acknowledgedAt,
  });

  if (!alreadyRecorded) {
    await audit.recordForUser(user, {
      action: AUDIT_ACTIONS.POLICY_ACKNOWLEDGED,
      entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
      entityId: version._id,
      metadata: {
        policyId: policy._id.toString(),
        policyCode: policy.code,
        versionNumber: version.versionNumber,
        timeSpentSeconds,
      },
      req,
    });
  }

  return { acknowledgement: toAcknowledgementView(acknowledgement), alreadyRecorded };
};

// --- T8: the per-version audit trail (UC-12, US-015) ------------------------
//
// Two lists in one response, because the question an auditor actually asks is
// "who agreed, and who still has not?" and answering it from two endpoints
// invites the two halves to disagree.

const listForVersion = async (policyId, versionId, { page = 1, limit = 50 } = {}, actor, req) => {
  const policy = await Policy.findById(policyId);
  AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

  const version = await PolicyVersion.findOne({ _id: versionId, policyId });
  AppAssert(version, NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);

  const skip = (page - 1) * limit;

  // Sorted by the compound index { policyVersionId: 1, acknowledgedAt: -1 },
  // so the sort is served by the index rather than done in memory. A version
  // can accumulate hundreds of these over its life, which is also why the list
  // is paginated rather than returned whole.
  const [records, totalAcknowledged] = await Promise.all([
    Acknowledgement.find({ policyVersionId: version._id })
      .sort({ acknowledgedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'fullName employeeId department'),
    Acknowledgement.countDocuments({ policyVersionId: version._id }),
  ]);

  // The outstanding list comes from the LEDGER, not from re-deriving the
  // audience over the users collection - see findByItem for why that matters.
  const openAssignments = await assignmentService.findByItem({
    itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    itemId: version._id,
    status: [
      ASSIGNMENT_STATUS.PENDING,
      ASSIGNMENT_STATUS.IN_PROGRESS,
      ASSIGNMENT_STATUS.OVERDUE,
    ],
    withUser: true,
  });

  const now = Date.now();

  const outstanding = openAssignments.map((assignment) => ({
    userId: assignment.userId ? assignment.userId._id.toString() : null,
    fullName: assignment.userId ? assignment.userId.fullName : '(account removed)',
    employeeId: assignment.userId ? assignment.userId.employeeId : null,
    department: assignment.department,
    dueDate: assignment.dueDate,
    isOverdue:
      assignment.status === ASSIGNMENT_STATUS.OVERDUE ||
      (assignment.dueDate && new Date(assignment.dueDate).getTime() < now),
  }));

  const totalAssigned = totalAcknowledged + outstanding.length;

  // Reading someone's compliance evidence is itself an act worth recording.
  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.COMPLIANCE_AUDIT_VIEWED,
    entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
    entityId: version._id,
    metadata: {
      policyId: policy._id.toString(),
      policyCode: policy.code,
      versionNumber: version.versionNumber,
      acknowledgedCount: totalAcknowledged,
      outstandingCount: outstanding.length,
    },
    req,
  });

  return {
    version: {
      id: version._id.toString(),
      versionNumber: version.versionNumber,
      title: version.title,
      status: version.status,
      publishedAt: version.publishedAt,
    },
    summary: {
      acknowledged: totalAcknowledged,
      outstanding: outstanding.length,
      assigned: totalAssigned,
      percentComplete: totalAssigned
        ? Math.round((totalAcknowledged / totalAssigned) * 100)
        : 0,
    },
    acknowledged: records.map((record) => ({
      id: record._id.toString(),
      fullName: record.userId ? record.userId.fullName : '(account removed)',
      employeeId: record.userId ? record.userId.employeeId : null,
      department: record.userId ? record.userId.department : null,
      acknowledgedAt: record.acknowledgedAt,
      timeSpentSeconds: record.timeSpentSeconds,
      // Part of the evidence: it is what distinguishes "signed from the
      // warehouse terminal" from "signed from an unknown address".
      ipAddress: record.ipAddress,
    })),
    outstanding,
    pagination: {
      page,
      limit,
      total: totalAcknowledged,
      pages: Math.max(1, Math.ceil(totalAcknowledged / limit)),
    },
  };
};

module.exports = { acknowledge, listForVersion, toAcknowledgementView };
