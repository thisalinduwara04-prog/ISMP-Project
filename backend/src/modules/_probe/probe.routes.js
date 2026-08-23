const express = require('express');

const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability, resolveScope } = require('../../middleware/authorize');
const { CAPABILITIES } = require('../../constants/permissions');
const { OK } = require('../../constants/http');

// ---------------------------------------------------------------------------
// TEST-ONLY. Mounted by app.js exclusively when NODE_ENV=test.
// ---------------------------------------------------------------------------
//
// NFR-SEC-03 requires proof that every authorisation decision is enforced
// server-side. That proof needs guarded routes to fire a low-privilege token
// at, and the real ones do not exist until M2-M5 land. These probes stand in:
// one route per capability, wired through exactly the same middleware the real
// routes will use, so the negative-path suite is meaningful from day one and
// keeps working as the real routes arrive.

const router = express.Router();

const echo = (req, res) =>
  res.status(OK).json({
    success: true,
    data: { role: req.user.role, department: req.user.department, scope: req.scope || null },
    requestId: req.id,
  });

router.use(authenticate, requirePasswordChanged);

// One endpoint per capability, named after it, so a failing test names the
// exact matrix cell that regressed.
Object.values(CAPABILITIES).forEach((capability) => {
  router.get(`/capability/${capability}`, requireCapability(capability), echo);
});

// Scope resolution, exercised separately from capability checks.
router.get(
  '/scope/compliance',
  requireCapability(CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT),
  resolveScope,
  echo
);

// A route requiring only authentication, for testing the forced
// password-change gate and plain session validity.
router.get('/authenticated', echo);

module.exports = router;
