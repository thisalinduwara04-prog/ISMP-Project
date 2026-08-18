const express = require('express');
const {
  createIncident,
  listMyIncidents,
  listAllIncidents,
  getIncident,
  updateIncidentStatus,
} = require('../controllers/incidentController');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const { validateBody } = require('../middleware/validate');
const { createIncidentSchema, updateIncidentStatusSchema } = require('../validators/incidentValidators');
const { uploadIncidentAttachment } = require('../middleware/upload');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(protect);

router.get('/mine', listMyIncidents);
router.get('/:id', getIncident);
router.post(
  '/',
  uploadIncidentAttachment.single('attachment'),
  validateBody(createIncidentSchema),
  createIncident
);

// Admin-only triage endpoints.
router.get('/', allowRoles(ROLES.ADMIN), listAllIncidents);
router.patch(
  '/:id/status',
  allowRoles(ROLES.ADMIN),
  validateBody(updateIncidentStatusSchema),
  updateIncidentStatus
);

module.exports = router;
