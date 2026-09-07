const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const Policy = require('../../models/Policy');
const PolicyVersion = require('../../models/PolicyVersion');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const audit = require('../audit/audit.service');
const { discard, directoryFor } = require('../../middleware/upload');
const { matchesAudience } = require('../../utils/audience');
const { NOT_FOUND, CONFLICT, FORBIDDEN, GONE } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { POLICY_VERSION_STATUS, POLICY_STATUS } = require('../../constants/policies');

// T9 - the signed PDF that sits alongside the readable on-screen text
// (US-016). The file itself lives outside any served directory and is reached
// only through the authenticated, audience-checked route below; there is no
// path by which it can be requested directly, and none by which it could be
// executed.

const STORAGE_KIND = 'policies';

// The stored file name is kept in `attachmentUrl` (spec section 7.6) but is
// NEVER sent to a client. What clients receive is the API path they may call,
// so the storage layout stays private and cannot be probed.
const downloadPath = (policyId, versionId) =>
  `/api/v1/policies/${policyId}/versions/${versionId}/attachment`;

const storedPathFor = (fileName) => path.join(directoryFor(STORAGE_KIND), path.basename(fileName));

const attach = async (policyId, versionId, file, actor, req) => {
  // Everything below runs AFTER multer has already written the file, so every
  // failure path from here on has to clean it up - otherwise a rejected upload
  // leaves an orphan on disk forever.
  try {
    const policy = await Policy.findById(policyId);
    AppAssert(policy, NOT_FOUND, 'Policy not found.', AppErrorCode.NOT_FOUND);

    const version = await PolicyVersion.findOne({ _id: versionId, policyId });
    AppAssert(version, NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);

    // Draft only, for the same reason the body is frozen: an acknowledgement
    // is evidence that someone read one exact artefact, and swapping the
    // attached PDF afterwards would quietly change what they agreed to.
    AppAssert(
      version.status === POLICY_VERSION_STATUS.DRAFT,
      CONFLICT,
      `Version ${version.versionNumber} is ${version.status}, so its attachment is fixed. Attach the PDF to a new draft instead.`,
      AppErrorCode.DUPLICATE_RESOURCE
    );

    const previous = version.attachmentUrl;

    version.attachmentUrl = file.filename;
    // Kept for display only. Never used to build a path.
    version.attachmentName = path.basename(file.originalname || 'policy.pdf');
    await version.save();

    // Replacing an attachment leaves the old file with nothing pointing at it.
    if (previous && previous !== file.filename) await discard(storedPathFor(previous));

    await audit.recordForUser(actor, {
      action: AUDIT_ACTIONS.POLICY_ATTACHMENT_ADDED,
      entityType: AUDIT_ENTITY_TYPE.POLICY_VERSION,
      entityId: version._id,
      metadata: {
        policyId: policy._id.toString(),
        versionNumber: version.versionNumber,
        originalName: version.attachmentName,
        sizeBytes: file.size,
      },
      req,
    });

    return {
      attachmentName: version.attachmentName,
      attachmentUrl: downloadPath(policyId, versionId),
      sizeBytes: file.size,
    };
  } catch (error) {
    // The database write failed, so nothing references this file. Delete it
    // rather than leaving an orphan that no cleanup job knows about.
    await discard(file.path);
    throw error;
  }
};

// Streamed through an authenticated route, never served from a static
// directory. The audience check is the same one that governs the version
// body: someone who may not read the policy may not read its PDF either.
const openStream = async (policyId, versionId, user, isAdmin) => {
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

  AppAssert(
    version.attachmentUrl,
    NOT_FOUND,
    'This version has no attachment.',
    AppErrorCode.NOT_FOUND
  );

  const filePath = storedPathFor(version.attachmentUrl);

  if (!fs.existsSync(filePath)) {
    // The row survived but the file did not - a restored database without its
    // uploads directory, most likely. Reported honestly rather than as a
    // stream that silently produces nothing.
    throw new AppError(
      NOT_FOUND,
      'The attached file is no longer available on the server.',
      AppErrorCode.NOT_FOUND
    );
  }

  return { filePath, downloadName: version.attachmentName || 'policy.pdf' };
};

const remove = async (policyId, versionId) => {
  const version = await PolicyVersion.findOne({ _id: versionId, policyId });
  AppAssert(version, NOT_FOUND, 'Policy version not found.', AppErrorCode.NOT_FOUND);

  AppAssert(
    version.status === POLICY_VERSION_STATUS.DRAFT,
    CONFLICT,
    'Only a draft version\'s attachment can be removed.',
    AppErrorCode.DUPLICATE_RESOURCE
  );

  if (version.attachmentUrl) await discard(storedPathFor(version.attachmentUrl));

  version.attachmentUrl = null;
  version.attachmentName = null;
  await version.save();

  return { removed: true };
};

// Exported so the version serialiser can present a download path instead of
// the stored file name.
const publicAttachment = (version) =>
  version.attachmentUrl
    ? {
        attachmentName: version.attachmentName,
        attachmentUrl: downloadPath(version.policyId.toString(), version._id.toString()),
      }
    : { attachmentName: null, attachmentUrl: null };

module.exports = { attach, openStream, remove, publicAttachment, storedPathFor, fsp };
