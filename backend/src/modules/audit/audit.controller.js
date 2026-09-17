const asyncHandler = require('../../utils/asyncHandler');
const { OK } = require('../../constants/http');
const auditService = require('./audit.service');

// Controllers do HTTP only: read the request, call one service, shape the
// response. No business rules live here - not even a role check, which is the
// router's job and the service's assumption.

const ok = (req, data) => ({ success: true, data, requestId: req.id });

const listAuditLogs = asyncHandler(async (req, res) => {
  const data = await auditService.listEntries(req.query, req.user, req);
  return res.status(OK).json(ok(req, data));
});

const listFilterOptions = asyncHandler(async (req, res) => {
  const data = await auditService.listFilterOptions();
  return res.status(OK).json(ok(req, data));
});

module.exports = { listAuditLogs, listFilterOptions };
