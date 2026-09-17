const express = require('express');

const controller = require('./auth.controller');
const { loginSchema, changePasswordSchema, stepUpSchema } = require('./auth.schemas');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { loginLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

// Public. The limiter runs before validation so a flood of malformed bodies is
// also absorbed.
router.post('/login', loginLimiter, validate(loginSchema), controller.login);

// Authenticated by the refresh cookie alone - the access token is expected to
// be expired by the time this is called.
router.post('/refresh', controller.refresh);

// `authenticate` is not applied to logout: a user whose access token has
// already expired must still be able to end their session and clear cookies.
router.post('/logout', controller.logout);

router.get('/me', authenticate, controller.me);

// Deliberately NOT behind requirePasswordChanged - this is the one action an
// account holding a temporary password is allowed to take (US-003).
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword
);

router.post('/step-up', authenticate, validate(stepUpSchema), controller.stepUp);

module.exports = router;
