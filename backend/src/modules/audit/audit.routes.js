const express = require('express');

const controller = require('./audit.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability } = require('../../middleware/authorize');
const { CAPABILITIES } = require('../../constants/permissions');
const { listAuditLogsQuery } = require('./audit.schemas');

const router = express.Router();

// Every route needs a session, and an account still holding a temporary
// password may not do normal work until it has been changed (US-003).
router.use(authenticate, requirePasswordChanged);

// Admin only, and deliberately not widened to MANAGER. A manager's reporting
// scope stops at their own department; this log carries every other
// department's activity and every failed login in the business, so there is no
// department-scoped version of it to offer.
const requireAuditView = requireCapability(CAPABILITIES.AUDIT_VIEW);

// No `resolveScope`: the log is organisation-wide by definition, so there is no
// department parameter to narrow and none is accepted.
router.get('/', requireAuditView, validate(listAuditLogsQuery, 'query'), controller.listAuditLogs);

// The values present in the log, for the filter controls. Declared before any
// ':id' route would be, so a literal path is never taken for a parameter.
router.get('/filters', requireAuditView, controller.listFilterOptions);

// There is deliberately no POST, PATCH or DELETE. The collection is append-only
// (AD-4); entries arrive through `audit.service.record` from the services that
// cause them, never from a client.

module.exports = router;
