const Policy = require('../../models/Policy');
const PolicyVersion = require('../../models/PolicyVersion');
const PolicyAttachment = require('../../models/PolicyAttachment');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const audit = require('../audit/audit.service');
const { matchesAudience } = require('../../utils/audience');
const { NOT_FOUND, CONFLICT, FORBIDDEN, GONE, BAD_REQUEST } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { POLICY_VERSION_STATUS, POLICY_STATUS } = require('../../constants/policies');

// T9 - the PDFs that accompany a policy version (US-016). The bytes live in
// MongoDB, so a file is reachable only through this authenticated,
// audience-checked route: there is no directory it could be served from and no
// path an employee could guess.
//
// A version may carry SEVERAL files - a policy is sometimes a covering
// document plus an annex, and merging them would mean editing a signed PDF.

// Bounded deliberately: each file may be 10 MB, so an unbounded list is a way
// to fill the database from a browser.
const MAX_ATTACHMENTS = 5;

const downloadPath = (policyId, versionId, attachmentId) =>
  `/api/v1/policies/${policyId}/versions/${versionId}/attachments/${attachmentId}`;

// Metadata only - never the bytes. This is what a version's JSON carries.
const toAttachmentView = (attachment, policyId) => ({
  id: attachment._id.toString(),
  name: attachment.originalName,
  sizeBytes: attachment.sizeBytes,
  uploadedAt: attachment.createdAt,
  url: downloadPath(policyId, attachment.policyVersionId.toString(), attachment._id.toString()),
});

// Used by the version serialiser. `data` is select:false on the model, so this
// cannot accidentally pull megabytes into a list response.
const listForVersion = async (policyId, versionId) => {
  const attachments = await PolicyAttachment.find({ policyVersionId: versionId }).sort({
    createdAt: 1,
  });

  return attachments.map((attachment) => toAttachmentView(attachment, policyId.toString()));
};

const loadEditableVersion = async (policyId, versionId) => {
  const policy = await Policy.findById(policyId);
  AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

  const version = await PolicyVersion.findOne({ _id: versionId, policyId });
  AppAssert(version, NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);

  // Draft only, for the same reason the body is frozen: an acknowledgement is
  // evidence that someone read one exact set of documents, and swapping a PDF
  // afterwards would quietly change what they agreed to.
  AppAssert(
    version.status === POLICY_VERSION_STATUS.DRAFT,
    CONFLICT,
    `Version ${version.versionNumber} is ${version.status}, so its attachments are fixed. Attach files to a new draft instead.`,
    AppErrorCode.DUPLICATE_RESOURCE
  );

  return { policy, version };
};

const attach = async (policyId, versionId, file, actor, req) => {
  const { policy, version } = await loadEditableVersion(policyId, versionId);

  const existing = await PolicyAttachment.countDocuments({ policyVersionId: version._id });
  AppAssert(
    existing < MAX_ATTACHMENTS,
    BAD_REQUEST,
    `A version may hold at most ${MAX_ATTACHMENTS} attachments. Remove one before adding another.`,
    AppErrorCode.VALIDATION_ERROR
  );

  // Appended, not replaced: uploading a second file adds it alongside the
  // first. Replacing is Remove followed by Add, which is explicit.
  const attachment = await PolicyAttachment.create({
    policyVersionId: version._id,
    policyId: policy._id,
    originalName: file.originalname,
    mimeType: 'application/pdf',
    sizeBytes: file.size,
    data: file.buffer,
    uploadedBy: actor._id,
  });

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.POLICY_ATTACHMENT_ADDED,
    entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
    entityId: version._id,
    metadata: {
      policyId: policy._id.toString(),
      versionNumber: version.versionNumber,
      originalName: file.originalname,
      sizeBytes: file.size,
      attachmentCount: existing + 1,
    },
    req,
  });

  return toAttachmentView(attachment, policyId.toString());
};

// Reads one file's bytes back. The audience check is the same one that governs
// the version body: someone who may not read the policy may not read its PDFs.
const read = async (policyId, versionId, attachmentId, user, isAdmin) => {
  const policy = await Policy.findById(policyId);
  AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

  const version = await PolicyVersion.findOne({ _id: versionId, policyId });
  AppAssert(version, NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);

  if (!isAdmin) {
    AppAssert(
      policy.status !== POLICY_STATUS.ARCHIVED &&
        version.status !== POLICY_VERSION_STATUS.ARCHIVED,
      GONE,
      'This policy has been withdrawn.',
      AppErrorCode.NOT_FOUND
    );

    AppAssert(
      version.status !== POLICY_VERSION_STATUS.DRAFT && matchesAudience(version, user),
      FORBIDDEN,
      'This policy does not apply to your role or department.',
      AppErrorCode.SCOPE_VIOLATION
    );
  }

  // Scoped by version as well as by id, so an attachment id from another
  // policy cannot be fetched through this one's URL.
  const attachment = await PolicyAttachment.findOne({
    _id: attachmentId,
    policyVersionId: version._id,
  }).select('+data');

  if (!attachment) {
    throw new AppError(NOT_FOUND, 'Attachment not found.', AppErrorCode.NOT_FOUND);
  }

  return {
    data: attachment.data,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    downloadName: attachment.originalName || 'policy.pdf',
  };
};

const remove = async (policyId, versionId, attachmentId) => {
  const { version } = await loadEditableVersion(policyId, versionId);

  const result = await PolicyAttachment.deleteOne({
    _id: attachmentId,
    policyVersionId: version._id,
  });

  AppAssert(
    result.deletedCount > 0,
    NOT_FOUND,
    'Attachment not found.',
    AppErrorCode.NOT_FOUND
  );

  return { removed: true };
};

// Called when versions are deleted, so the bytes go with them rather than
// lingering in the database with nothing pointing at them.
const removeForVersions = async (versionIds) => {
  const result = await PolicyAttachment.deleteMany({ policyVersionId: { $in: versionIds } });
  return { deletedCount: result.deletedCount || 0 };
};

const countForVersion = (versionId) =>
  PolicyAttachment.countDocuments({ policyVersionId: versionId });

module.exports = {
  attach,
  read,
  remove,
  removeForVersions,
  listForVersion,
  countForVersion,
  downloadPath,
  MAX_ATTACHMENTS,
};
