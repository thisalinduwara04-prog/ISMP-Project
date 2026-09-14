const asyncHandler = require('../../utils/asyncHandler');
const { OK, CREATED } = require('../../constants/http');
const incidentService = require('./incident.service');

// Controllers do HTTP only: read the request, call one service, shape the
// response. No business rules live here.

const requestContext = (req) => ({
  req,
  user: req.user,
  userAgent: req.get('user-agent') || null,
  ipAddress: req.ip,
});

const ok = (req, data) => ({ success: true, data, requestId: req.id });

const create = asyncHandler(async (req, res) => {
  // `req.file` is populated by multer's upload.single('attachment'), which runs
  // before validation - multipart text fields do not exist on req.body until it
  // has parsed the request.
  const incident = await incidentService.submit(req.body, req.file, requestContext(req));

  return res.status(CREATED).json(ok(req, { incident }));
});

const list = asyncHandler(async (req, res) => {
  const result = await incidentService.list(req.query, requestContext(req));

  return res.status(OK).json(ok(req, result));
});

const detail = asyncHandler(async (req, res) => {
  const incident = await incidentService.getById(req.params.id, requestContext(req));

  return res.status(OK).json(ok(req, { incident }));
});

const update = asyncHandler(async (req, res) => {
  const incident = await incidentService.update(req.params.id, req.body, requestContext(req));

  return res.status(OK).json(ok(req, { incident }));
});

const downloadAttachment = asyncHandler(async (req, res) => {
  const { absolutePath, fileName, mimeType } = await incidentService.getAttachment(
    req.params.id,
    req.params.fid,
    requestContext(req)
  );

  // `attachment` rather than `inline`: an uploaded file is evidence to be saved
  // and inspected, never something to render in the browser tab of the security
  // tool that received it.
  res.type(mimeType);
  return res.download(absolutePath, fileName);
});

module.exports = { create, list, detail, update, downloadAttachment };
