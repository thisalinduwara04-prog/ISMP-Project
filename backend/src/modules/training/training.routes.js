const express = require('express');

const controller = require('./training.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability } = require('../../middleware/authorize');
const { CAPABILITIES } = require('../../constants/permissions');
const {
  moduleParams,
  attemptParams,
  createModuleSchema,
  updateModuleSchema,
  publishModuleSchema,
  deleteModuleSchema,
  progressSchema,
  startAttemptSchema,
  saveAnswersSchema,
  submitAttemptSchema,
  resetAttemptsSchema,
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

// Permanent deletion, and the only route in the module that destroys evidence.
// The service refuses unless the caller confirms the loss of any quiz attempts
// recorded against the module.
router.delete(
  '/modules/:id',
  requireAuthor,
  validate(moduleParams, 'params'),
  validate(deleteModuleSchema),
  controller.deleteModule
);

// One path, two views. The service returns the admin projection to an admin and
// the learner projection - answer key stripped - to everybody else, so there is
// no employee-facing route in this module that could return `isCorrect` (AD-3).
// A caller outside the target audience gets 403, not a filtered-down module.
router.get('/modules/:id', validate(moduleParams, 'params'), controller.getModule);

// Who has completed this module, and who has not (the training counterpart of
// UC-12's acknowledgement trail). Not in the section 8.4 table: an author who
// can publish work to people needs to see whether it was done, and the
// organisation-wide version of this question belongs to M4.
router.get(
  '/modules/:id/completions',
  requireAuthor,
  validate(moduleParams, 'params'),
  controller.listCompletions
);

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

// --- T4: working through a module ---
//
// No capability guard beyond authentication: every role holds TRAINING_COMPLETE.
// The real gates are inside the service - the module must be published, aimed
// at this person, and assigned to them - and none of those can be expressed as
// a capability.
router.post(
  '/modules/:id/progress',
  validate(moduleParams, 'params'),
  validate(progressSchema),
  controller.markProgress
);

// --- T5: the quiz attempt lifecycle ---

// Refused with 403 until every content item is complete, and again once the
// attempts are used up. Both checks live in the service, so sending this
// request straight at the API achieves nothing a locked button would not.
router.post(
  '/modules/:id/attempts',
  validate(moduleParams, 'params'),
  validate(startAttemptSchema),
  controller.startAttempt
);

// Owner only, enforced in the service by comparing the attempt's userId with
// the caller's - there is no role that lets somebody sit another person's quiz.
router.patch(
  '/attempts/:aid',
  validate(attemptParams, 'params'),
  validate(saveAnswersSchema),
  controller.saveAttempt
);

router.post(
  '/attempts/:aid/submit',
  validate(attemptParams, 'params'),
  validate(submitAttemptSchema),
  controller.submitAttempt
);

// Owner or ADMIN: an admin has to be able to see the result they are being
// asked to reset. Neither of them receives an answer key (AD-3).
router.get('/attempts/:aid', validate(attemptParams, 'params'), controller.getAttempt);

// --- T6: giving somebody their attempts back ---
//
// Not in the section 8.4 table - UC-17 and US-024 require a way back for
// someone who has used every attempt, and no other route could grant it.
// Deletes nothing: the historical attempts remain and an audit entry records
// who authorised the reset.
router.post(
  '/modules/:id/attempts/reset',
  requireAuthor,
  validate(moduleParams, 'params'),
  validate(resetAttemptsSchema),
  controller.resetAttempts
);

module.exports = router;
