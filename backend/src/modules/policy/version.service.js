const mongoose = require('mongoose');

const Policy = require('../../models/Policy');
const PolicyVersion = require('../../models/PolicyVersion');
const Acknowledgement = require('../../models/Acknowledgement');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const User = require('../../models/User');
const audit = require('../audit/audit.service');
const assignmentService = require('../assignment/assignment.service');
const { withTransaction } = require('../../utils/withTransaction');
const { audienceUserFilter, matchesAudience } = require('../../utils/audience');
const { BAD_REQUEST, NOT_FOUND, CONFLICT, FORBIDDEN } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE, AUDIT_OUTCOME } = require('../../constants/auditActions');
const { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_SOURCE } = require('../../constants/assignments');
const {
  POLICY_STATUS,
  POLICY_VERSION_STATUS,
  DEFAULT_POLICY_DUE_IN_DAYS,
} = require('../../constants/policies');
const { isAdmin, toVersionSummary, notFound } = require('./policy.service');
const { publicAttachment, storedPathFor } = require('./attachment.service');
const { discard } = require('../../middleware/upload');

const discardStoredFile = (fileName) => discard(storedPathFor(fileName));

// Version authoring (T3) and publication (T4).
//
// The rule everything here serves: a published version is a fixed artefact.
// It is written freely while it is a draft, and from the moment it is
// published it is read-only for good, because people's acknowledgements point
// at it and evidence that can be edited afterwards is not evidence.

const isDuplicateKey = (error) => !!error && error.code === 11000;

const dedupe = (values) => [...new Set(values || [])];

const toVersionDetail = (version) => ({
  ...toVersionSummary(version),
  policyId: version.policyId.toString(),
  title: version.title,
  body: version.body,
  changeNote: version.changeNote,
  // The download PATH, never the stored file name - see attachment.service.
  ...publicAttachment(version),
  targetRoles: version.targetRoles,
  targetDepartments: version.targetDepartments,
  authoredBy: version.authoredBy,
  publishedBy: version.publishedBy,
  createdAt: version.createdAt,
});

const loadPolicy = async (policyId) => {
  const policy = await Policy.findById(policyId);
  if (!policy) throw notFound();
  return policy;
};

const loadVersion = async (policyId, versionId) => {
  // Scoped by policyId as well as by id, so a version id from another policy
  // cannot be reached through this policy's URL.
  const version = await PolicyVersion.findOne({ _id: versionId, policyId });
  if (!version) {
    throw new AppError(NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);
  }
  return version;
};

// A change note is what tells a reader being asked to re-acknowledge what
// actually changed. There is nothing to describe for v1, so it is required
// from v2 onward - enforced here, and again by the model as a backstop.
const assertChangeNote = (versionNumber, changeNote) =>
  AppAssert(
    versionNumber < 2 || (changeNote && changeNote.trim().length > 0),
    BAD_REQUEST,
    'A change note is required from version 2 onward: staff being asked to re-acknowledge need to know what changed.',
    AppErrorCode.VALIDATION_ERROR,
    [{ field: 'changeNote', issue: 'required from version 2' }]
  );

// --- T3: draft authoring ----------------------------------------------------

const MAX_VERSION_NUMBER_ATTEMPTS = 3;

const createDraft = async (policyId, payload, actor) => {
  const policy = await loadPolicy(policyId);

  AppAssert(
    policy.status === POLICY_STATUS.ACTIVE,
    CONFLICT,
    'This policy is archived. Restore it before adding a version.',
    AppErrorCode.DUPLICATE_RESOURCE
  );

  // Only one draft at a time. Two half-written drafts of the same policy is
  // never what anyone wanted - it is two admins who did not know about each
  // other - so the second is pointed at the first rather than creating it
  // (UC-08, "a DRAFT already exists"). No index enforces this; it is an
  // application rule, and the 409 below is where it lives.
  const existingDraft = await PolicyVersion.findOne({
    policyId: policy._id,
    status: POLICY_VERSION_STATUS.DRAFT,
  });

  if (existingDraft) {
    throw new AppError(
      CONFLICT,
      `A draft of this policy already exists (version ${existingDraft.versionNumber}). Resume that draft rather than starting a second one.`,
      AppErrorCode.DUPLICATE_RESOURCE,
      [{ field: 'draftVersionId', issue: existingDraft._id.toString() }]
    );
  }

  // Read-then-write on the version number is a race: two admins creating a
  // version at the same instant both read the same highest number. The unique
  // index on { policyId, versionNumber } rejects the loser, and this retries
  // with the number it can now see. The database decides, not the read.
  for (let attempt = 1; ; attempt += 1) {
    const latest = await PolicyVersion.findOne({ policyId: policy._id })
      .sort({ versionNumber: -1 })
      .select('versionNumber');

    const versionNumber = latest ? latest.versionNumber + 1 : 1;
    assertChangeNote(versionNumber, payload.changeNote);

    try {
      const version = await PolicyVersion.create({
        policyId: policy._id,
        versionNumber,
        title: payload.title || policy.title,
        body: payload.body,
        changeNote: payload.changeNote || '',
        targetRoles: dedupe(payload.targetRoles),
        targetDepartments: dedupe(payload.targetDepartments),
        dueInDays: payload.dueInDays || DEFAULT_POLICY_DUE_IN_DAYS,
        status: POLICY_VERSION_STATUS.DRAFT,
        authoredBy: actor._id,
      });

      return toVersionDetail(version);
    } catch (error) {
      if (!isDuplicateKey(error) || attempt >= MAX_VERSION_NUMBER_ATTEMPTS) throw error;
    }
  }
};

const updateDraft = async (policyId, versionId, payload) => {
  const version = await loadVersion(policyId, versionId);

  // The immutability rule, surfaced as a clear 409 rather than as the model
  // hook's error. Published text is corrected by publishing a new version.
  AppAssert(
    version.status === POLICY_VERSION_STATUS.DRAFT,
    CONFLICT,
    `Version ${version.versionNumber} is ${version.status} and can no longer be edited. Create a new version instead.`,
    AppErrorCode.DUPLICATE_RESOURCE
  );

  assertChangeNote(
    version.versionNumber,
    'changeNote' in payload ? payload.changeNote : version.changeNote
  );

  if (payload.targetRoles) payload.targetRoles = dedupe(payload.targetRoles);
  if (payload.targetDepartments) payload.targetDepartments = dedupe(payload.targetDepartments);

  Object.assign(version, payload);
  await version.save();

  return toVersionDetail(version);
};

// Reading one version. Audience-checked: a user outside the target audience
// gets 403, NOT a 404 that pretends the version does not exist. The spec is
// explicit about that, and it is the check T5's acceptance test fires a
// warehouse token at.
const getVersion = async (policyId, versionId, user, req) => {
  const version = await loadVersion(policyId, versionId);

  if (isAdmin(user)) return toVersionDetail(version);

  // Refused reads are audited, not merely refused. A burst of these from one
  // account is what someone probing for documents they should not see looks
  // like (NFR-SEC-06).
  const denyView = async (reason) => {
    await audit.recordForUser(user, {
      action: AUDIT_ACTIONS.RBAC_SCOPE_VIEW_DENIED,
      outcome: AUDIT_OUTCOME.DENIED,
      entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
      entityId: version._id,
      metadata: {
        reason,
        policyId: policyId.toString(),
        versionNumber: version.versionNumber,
        userRole: user.role,
        userDepartment: user.department,
        targetRoles: version.targetRoles,
        targetDepartments: version.targetDepartments,
      },
      req,
    });

    return new AppError(
      FORBIDDEN,
      'This policy does not apply to your role or department.',
      AppErrorCode.SCOPE_VIOLATION
    );
  };

  // A draft is not a document anyone has been asked to read yet.
  if (version.status === POLICY_VERSION_STATUS.DRAFT) throw await denyView('NOT_PUBLISHED');

  // 403, deliberately - NOT a 404 that pretends the version does not exist.
  // The spec is explicit, and this is the check T19 fires a warehouse token at.
  if (!matchesAudience(version, user)) throw await denyView('OUTSIDE_AUDIENCE');

  // The view-open timestamp. T6 derives timeSpentSeconds from THIS rather than
  // from a number posted by the client, so a flattering "I read it for four
  // minutes" cannot be sent from a browser console.
  await audit.recordForUser(user, {
    action: AUDIT_ACTIONS.POLICY_VIEWED,
    entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
    entityId: version._id,
    metadata: { policyId: policyId.toString(), versionNumber: version.versionNumber },
    req,
  });

  return toVersionDetail(version);
};

// Deleting one version.
//
// A DRAFT was never published: nobody was assigned it, nobody acknowledged it,
// and deleting one destroys nothing. That is the ordinary case and needs no
// confirmation beyond the button.
//
// Deleting a version that WAS published is a different act - it erases the
// acknowledgements recorded against it, which are the proof that named staff
// read that exact wording. Archiving the policy (UC-11) is the reversible
// retirement that keeps them, so this path refuses unless the caller has been
// told what would be lost and says to proceed anyway.
const deleteVersion = async (policyId, versionId, { acknowledgeEvidenceLoss } = {}, actor, req) => {
  const policy = await loadPolicy(policyId);
  const version = await loadVersion(policyId, versionId);

  const wasPublished = version.status !== POLICY_VERSION_STATUS.DRAFT;

  const evidenceCount = wasPublished
    ? await Acknowledgement.countDocuments({ policyVersionId: version._id })
    : 0;

  AppAssert(
    evidenceCount === 0 || acknowledgeEvidenceLoss === true,
    CONFLICT,
    `Version ${version.versionNumber} holds ${evidenceCount} acknowledgement${
      evidenceCount === 1 ? '' : 's'
    } — proof that named staff read this exact wording. Deleting destroys that permanently. Archive the policy instead to withdraw it while keeping the evidence.`,
    AppErrorCode.VALIDATION_ERROR,
    [
      {
        field: 'acknowledgeEvidenceLoss',
        issue: `${evidenceCount} acknowledgements would be destroyed`,
      },
    ]
  );

  // Written first, so the record of the deletion survives even if what follows
  // fails halfway through.
  await audit.recordForUser(actor, {
    action: wasPublished
      ? AUDIT_ACTIONS.POLICY_VERSION_DELETED
      : AUDIT_ACTIONS.POLICY_DRAFT_DELETED,
    entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
    entityId: version._id,
    metadata: {
      policyId: policy._id.toString(),
      policyCode: policy.code,
      versionNumber: version.versionNumber,
      status: version.status,
      acknowledgementsDestroyed: evidenceCount,
    },
    req,
  });

  // The attached file would otherwise be orphaned on disk with nothing
  // referencing it.
  if (version.attachmentUrl) await discardStoredFile(version.attachmentUrl);

  if (wasPublished) {
    // Insert-only at the model layer, so this goes through the driver - the
    // bypass being exactly why the guard above exists.
    await mongoose.connection
      .collection('acknowledgements')
      .deleteMany({ policyVersionId: version._id });

    // Ledger rows pointing at a version that no longer exists would surface in
    // every dashboard as an unresolvable task.
    await assignmentService.removeForItems({
      itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
      itemIds: [version._id],
    });
  }

  await PolicyVersion.deleteOne({ _id: version._id });

  // Deleting the live version leaves the policy with nothing published. It is
  // NOT silently replaced by the previous one: that version was superseded on
  // purpose, and quietly reviving it would put wording back in force that an
  // admin had deliberately retired. The policy stays without a current version
  // until a new one is published.
  if (policy.currentVersionId && policy.currentVersionId.toString() === versionId.toString()) {
    policy.currentVersionId = null;
    await policy.save();
  }

  return {
    deleted: true,
    versionNumber: version.versionNumber,
    acknowledgementsDestroyed: evidenceCount,
    policyHasNoCurrentVersion: policy.currentVersionId === null,
  };
};

// --- T4: publish ------------------------------------------------------------

const publish = async (policyId, versionId, { effectiveFrom } = {}, actor, req) => {
  // Everything that can be refused is refused BEFORE any write happens, so a
  // rejected publication leaves the policy exactly as it was.
  const policy = await loadPolicy(policyId);
  AppAssert(
    policy.status === POLICY_STATUS.ACTIVE,
    CONFLICT,
    'This policy is archived and cannot be published to.',
    AppErrorCode.DUPLICATE_RESOURCE
  );

  const draft = await loadVersion(policyId, versionId);
  AppAssert(
    draft.status === POLICY_VERSION_STATUS.DRAFT,
    CONFLICT,
    `Only a DRAFT can be published; version ${draft.versionNumber} is already ${draft.status}.`,
    AppErrorCode.DUPLICATE_RESOURCE
  );

  assertChangeNote(draft.versionNumber, draft.changeNote);

  const audience = { roles: draft.targetRoles, departments: draft.targetDepartments };

  // Publishing to nobody is a mistake, not an empty success. Checked before
  // the writes so the draft survives to be corrected (UC-08, 3a).
  const targetCount = await User.countDocuments(audienceUserFilter(audience));
  AppAssert(
    targetCount > 0,
    BAD_REQUEST,
    'No active user matches this audience, so publishing would assign the policy to nobody. Widen the target roles or departments.',
    AppErrorCode.VALIDATION_ERROR
  );

  const publishedAt = new Date();

  const outcome = await withTransaction(async (session) => {
    // Re-read inside the transaction. `withTransaction` may re-run this
    // callback after a transient conflict, and a document mutated outside
    // would already be marked clean, so the retry would silently write
    // nothing. Re-reading also closes the window between the checks above and
    // the writes below.
    const currentPolicy = await Policy.findById(policyId).session(session);
    const version = await PolicyVersion.findById(versionId).session(session);
    const previous = await PolicyVersion.findOne({
      policyId,
      status: POLICY_VERSION_STATUS.PUBLISHED,
    }).session(session);

    let supersededCount = 0;

    // ORDER MATTERS. The partial unique index permits exactly one PUBLISHED
    // version per policy, so the outgoing version must be demoted before the
    // incoming one is promoted - otherwise the database rejects the write.
    // That constraint is the safety net: there is no sequence of events, crash
    // or race included, that leaves two live versions of one policy.
    if (previous) {
      previous.status = POLICY_VERSION_STATUS.SUPERSEDED;
      await previous.save({ session });

      // Only OPEN assignments move. The acknowledgements recorded against the
      // old version are not touched by this or anything else - they are the
      // permanent record of who agreed to that exact wording (BR-01, BR-02).
      ({ supersededCount } = await assignmentService.supersede({
        itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
        itemId: previous._id,
        session,
      }));
    }

    version.status = POLICY_VERSION_STATUS.PUBLISHED;
    version.publishedBy = actor._id;
    version.publishedAt = publishedAt;
    version.effectiveFrom = effectiveFrom || publishedAt;
    await version.save({ session });

    currentPolicy.currentVersionId = version._id;
    await currentPolicy.save({ session });

    // Through the service, never `Assignment.updateMany()` from in here. The
    // ledger belongs to M4 (NFR-MNT-01).
    const fanOutResult = await assignmentService.fanOut({
      itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
      itemId: version._id,
      itemTitle: version.title,
      audience,
      dueInDays: version.dueInDays,
      source: ASSIGNMENT_SOURCE.PUBLICATION,
      session,
    });

    return { version, previous, supersededCount, fanOutResult };
  });

  // TODO (T4, step 9 / US-012): notify every user in outcome.fanOutResult.userIds.
  // Deliberately not written yet - the notification event payload and whether
  // dispatch is synchronous or queued are still open items from T0, and
  // inventing that contract here would commit the group to it.

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.POLICY_PUBLISHED,
    entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
    entityId: outcome.version._id,
    metadata: {
      policyId: policy._id.toString(),
      policyCode: policy.code,
      versionNumber: outcome.version.versionNumber,
      supersededVersionId: outcome.previous ? outcome.previous._id.toString() : null,
      supersededAssignments: outcome.supersededCount,
      targetCount,
      assignedCount: outcome.fanOutResult.assignedCount,
    },
    req,
  });

  return {
    version: toVersionDetail(outcome.version),
    publication: {
      targetCount,
      assignedCount: outcome.fanOutResult.assignedCount,
      alreadyAssignedCount: outcome.fanOutResult.skippedCount,
      supersededVersionNumber: outcome.previous ? outcome.previous.versionNumber : null,
      supersededAssignments: outcome.supersededCount,
    },
  };
};

module.exports = { createDraft, updateDraft, getVersion, publish, deleteVersion, toVersionDetail };
