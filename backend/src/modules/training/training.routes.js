const express = require('express');

const controller = require('./training.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability } = require('../../middleware/authorize');
const { CAPABILITIES } = require('../../constants/permissions');
const {
  moduleParams,
  createModuleSchema,
  updateModuleSchema,
  publishModuleSchema,
} = require('./training.schemas');

const router = express.Router();

// Every route needs a session, and an account still holding a temporary
// password may not do normal work until it has been changed (US-003).
router.use(authenticate, requirePasswordChanged);

// Routes declare the CAPABILITY they need rather than the role that holds it.
// TRAINING_AUTHOR belongs to ADMIN alone in constants/permissions.js, so a
// MANAGER or EMPLOYEE token gets 403 here and the denial is audited - which is
// what NFR-SEC-03 is verified by. Removing the guard from React grants nothing.
const requireAuthor = requireCapability(CAPABILITIES.TRAINING_AUTHOR);

// --- T2: authoring (spec section 8.4) ---

// Audience-filtered inside the service: an employee sees the published modules
// aimed at them, an admin sees everything including drafts.
router.get('/modules', controller.listModules);

router.post('/modules', requireAuthor, validate(createModuleSchema), controller.createModule);

router.patch(
  '/modules/:id',
  requireAuthor,
  validate(moduleParams, 'params'),
  validate(updateModuleSchema),
  controller.updateModule
);

// One path, two views. The service returns the admin projection to an admin and
// the learner projection - answer key stripped - to everybody else, so there is
// no employee-facing route in this module that could return `isCorrect` (AD-3).
// A caller outside the target audience gets 403, not a filtered-down module.
router.get('/modules/:id', validate(moduleParams, 'params'), controller.getModule);

// --- T3: publish and fan out ---
//
// The act that turns authored material into work assigned to named people.
// Separate from editing for exactly that reason.
router.post(
  '/modules/:id/publish',
  requireAuthor,
  validate(moduleParams, 'params'),
  validate(publishModuleSchema),
  controller.publishModule
);

module.exports = router;
