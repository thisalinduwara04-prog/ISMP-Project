const express = require('express');
const { listUsers, updateUserRole, updateUserStatus } = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(protect, allowRoles(ROLES.ADMIN));

router.get('/', listUsers);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);

module.exports = router;
