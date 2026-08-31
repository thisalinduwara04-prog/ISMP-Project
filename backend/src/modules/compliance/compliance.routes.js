const express = require('express');

const controller = require('./compliance.controller');
const { authenticate, requireRecentAuthentication } = require('../../middleware/authenticate');
const { ROLES } = require('../../constants/roles');
const { requireCapability, resolveScope } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { CAPABILITIES } = require('../../constants/permissions');
const schemas = require('./compliance.schemas');

const router = express.Router();
router.use(authenticate);

const requireAdminStepUp = (req, res, next) => (
  req.user.role === ROLES.ADMIN ? requireRecentAuthentication(30)(req, res, next) : next()
);

router.get('/me', requireCapability(CAPABILITIES.COMPLIANCE_VIEW_SELF), asyncHandler(controller.me));
router.get(
  '/dashboard',
  requireCapability(CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT, CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION),
  validate(schemas.filtersSchema, 'query'),
  asyncHandler(resolveScope),
  requireAdminStepUp,
  asyncHandler(controller.dashboard)
);
router.get(
  '/outstanding',
  requireCapability(CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT, CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION),
  validate(schemas.outstandingQuerySchema, 'query'),
  asyncHandler(resolveScope),
  requireAdminStepUp,
  asyncHandler(controller.outstanding)
);
router.post(
  '/reminders',
  requireCapability(CAPABILITIES.REMINDER_SEND),
  validate(schemas.reminderSchema),
  asyncHandler(resolveScope),
  asyncHandler(controller.sendReminders)
);
router.post(
  '/reports/export',
  requireCapability(CAPABILITIES.REPORT_EXPORT),
  validate(schemas.exportSchema),
  asyncHandler(resolveScope),
  requireAdminStepUp,
  asyncHandler(controller.exportReport)
);

module.exports = router;
