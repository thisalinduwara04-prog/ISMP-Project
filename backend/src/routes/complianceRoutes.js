const express = require('express');
const { getOverview, exportExcel, exportPdf } = require('../controllers/complianceController');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const { COMPLIANCE_VIEWER_ROLES } = require('../config/constants');

const router = express.Router();

router.use(protect, allowRoles(...COMPLIANCE_VIEWER_ROLES));

router.get('/overview', getOverview);
router.get('/export/excel', exportExcel);
router.get('/export/pdf', exportPdf);

module.exports = router;
