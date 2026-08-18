const express = require('express');
const {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicyMeta,
  addPolicyVersion,
  acknowledgePolicy,
  archivePolicy,
} = require('../controllers/policyController');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const { validateBody } = require('../middleware/validate');
const { createPolicySchema, newVersionSchema, updatePolicyMetaSchema } = require('../validators/policyValidators');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(protect);

router.get('/', listPolicies);
router.get('/:id', getPolicy);
router.post('/:id/acknowledge', acknowledgePolicy);

// Admin-only management endpoints.
router.post('/', allowRoles(ROLES.ADMIN), validateBody(createPolicySchema), createPolicy);
router.patch('/:id', allowRoles(ROLES.ADMIN), validateBody(updatePolicyMetaSchema), updatePolicyMeta);
router.post('/:id/versions', allowRoles(ROLES.ADMIN), validateBody(newVersionSchema), addPolicyVersion);
router.delete('/:id', allowRoles(ROLES.ADMIN), archivePolicy);

module.exports = router;
