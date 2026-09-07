const express = require('express');

const controller = require('./incident.controller');
const {
  objectIdParamSchema,
  createIncidentSchema,
  listIncidentsSchema,
  updateIncidentSchema,
} = require('./incident.schemas');
const { upload } = require('./attachment.service');
const { validate } = require('../../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability } = require('../../middleware/authorize');
const { CAPABILITIES } = require('../../constants/permissions');

const router = express.Router();

// Every incident route needs a real, fully-onboarded session. Applied once here
// rather than repeated per route, so a route added later cannot be left
// unguarded by omission.
router.use(authenticate, requirePasswordChanged);

// UC-22. `upload.single` MUST run before `validate`: with multipart/form-data
// the text fields do not exist on req.body until multer has parsed the body.
router.post(
  '/',
  requireCapability(CAPABILITIES.INCIDENT_SUBMIT),
  upload.single('attachment'),
  validate(createIncidentSchema),
  controller.create
);

// One endpoint, two audiences - the service decides between "all" and "own"
// (spec section 8.6). Both capabilities are accepted here because the narrowing
// is data scope, not permission.
router.get(
  '/',
  requireCapability(CAPABILITIES.INCIDENT_VIEW_OWN, CAPABILITIES.INCIDENT_TRIAGE),
  validate(listIncidentsSchema, 'query'),
  controller.list
);

router.get(
  '/:id',
  requireCapability(CAPABILITIES.INCIDENT_VIEW_OWN, CAPABILITIES.INCIDENT_TRIAGE),
  validate(objectIdParamSchema, 'params'),
  controller.detail
);

// UC-23. Triage is admin-only, and the transition rules are enforced in the
// service regardless of what the UI offered (NFR-SEC-03).
router.patch(
  '/:id',
  requireCapability(CAPABILITIES.INCIDENT_TRIAGE),
  validate(objectIdParamSchema, 'params'),
  validate(updateIncidentSchema),
  controller.update
);

router.get(
  '/:id/attachments/:fid',
  requireCapability(CAPABILITIES.INCIDENT_VIEW_OWN, CAPABILITIES.INCIDENT_TRIAGE),
  validate(objectIdParamSchema, 'params'),
  controller.downloadAttachment
);

module.exports = router;
