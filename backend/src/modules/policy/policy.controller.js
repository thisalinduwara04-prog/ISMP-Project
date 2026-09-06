const asyncHandler = require('../../utils/asyncHandler');
const { OK, CREATED } = require('../../constants/http');
const policyService = require('./policy.service');
const versionService = require('./version.service');
const acknowledgementService = require('./acknowledgement.service');
const attachmentService = require('./attachment.service');

// Controllers do HTTP only: read the request, call one service, shape the
// response. No business rules live here - not even a role check, which is the
// router's job and the service's assumption.

const ok = (req, data) => ({ success: true, data, requestId: req.id });

// --- T2: the policy shell ---

const createPolicy = asyncHandler(async (req, res) => {
  const policy = await policyService.createPolicy(req.body, req.user);
  return res.status(CREATED).json(ok(req, { policy }));
});

const listPolicies = asyncHandler(async (req, res) => {
  const policies = await policyService.listPolicies(req.user, req.query);
  return res.status(OK).json(ok(req, { policies, count: policies.length }));
});

const getPolicy = asyncHandler(async (req, res) => {
  const policy = await policyService.getPolicyById(req.params.id, req.user);
  return res.status(OK).json(ok(req, { policy }));
});

const updatePolicy = asyncHandler(async (req, res) => {
  const policy = await policyService.updatePolicy(req.params.id, req.body, req.user, req);
  return res.status(OK).json(ok(req, { policy }));
});

// --- T3: draft version authoring ---

const createVersion = asyncHandler(async (req, res) => {
  const version = await versionService.createDraft(req.params.id, req.body, req.user);
  return res.status(CREATED).json(ok(req, { version }));
});

const updateVersion = asyncHandler(async (req, res) => {
  const version = await versionService.updateDraft(req.params.id, req.params.vid, req.body);
  return res.status(OK).json(ok(req, { version }));
});

const getVersion = asyncHandler(async (req, res) => {
  const version = await versionService.getVersion(req.params.id, req.params.vid, req.user, req);
  return res.status(OK).json(ok(req, { version }));
});

// --- T6: acknowledge ---

const acknowledgeVersion = asyncHandler(async (req, res) => {
  const result = await acknowledgementService.acknowledge(
    req.params.id,
    req.params.vid,
    req.user,
    req
  );

  // 201 the first time, 200 on a repeat submit returning the original record.
  // Both are successes: the endpoint is idempotent by design (UC-10, 6a).
  return res.status(result.alreadyRecorded ? OK : CREATED).json(ok(req, result));
});

// --- T4: publish ---

const publishVersion = asyncHandler(async (req, res) => {
  const result = await versionService.publish(
    req.params.id,
    req.params.vid,
    req.body,
    req.user,
    req
  );
  return res.status(OK).json(ok(req, result));
});

const deletePolicy = asyncHandler(async (req, res) => {
  const result = await policyService.destroy(req.params.id, req.body, req.user, req);
  return res.status(OK).json(ok(req, result));
});

const deleteVersion = asyncHandler(async (req, res) => {
  const result = await versionService.deleteVersion(
    req.params.id,
    req.params.vid,
    req.body,
    req.user,
    req
  );
  return res.status(OK).json(ok(req, result));
});

// --- T8: acknowledgement audit trail ---

const listAcknowledgements = asyncHandler(async (req, res) => {
  const data = await acknowledgementService.listForVersion(
    req.params.id,
    req.params.vid,
    req.query,
    req.user,
    req
  );
  return res.status(OK).json(ok(req, data));
});

// --- T9: PDF attachment ---

const attachFile = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.attach(
    req.params.id,
    req.params.vid,
    req.file,
    req.user,
    req
  );
  return res.status(CREATED).json(ok(req, { attachment }));
});

const downloadAttachment = asyncHandler(async (req, res) => {
  const { filePath, downloadName } = await attachmentService.openStream(
    req.params.id,
    req.params.vid,
    req.user,
    policyService.isAdmin(req.user)
  );

  // `inline` so a phone opens it in the viewer rather than forcing a download
  // the user then has to find. Content-Type is fixed because the magic-byte
  // check on the way in guarantees what this file is.
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`);
  return res.sendFile(filePath);
});

const removeAttachment = asyncHandler(async (req, res) => {
  const result = await attachmentService.remove(req.params.id, req.params.vid);
  return res.status(OK).json(ok(req, result));
});

module.exports = {
  createPolicy,
  listPolicies,
  getPolicy,
  updatePolicy,
  deletePolicy,
  createVersion,
  updateVersion,
  getVersion,
  publishVersion,
  deleteVersion,
  acknowledgeVersion,
  listAcknowledgements,
  attachFile,
  downloadAttachment,
  removeAttachment,
};
