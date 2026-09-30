const rateLimit = require('express-rate-limit');

const env = require('../config/env');
const AppErrorCode = require('../constants/appErrorCode');
const { TOO_MANY_REQUESTS } = require('../constants/http');

const envelope = (req) => ({
  success: false,
  error: {
    code: AppErrorCode.RATE_LIMITED,
    message: 'Too many attempts. Please wait a few minutes and try again.',
  },
  requestId: req.id,
});

// Keyed on IP AND account together, so it slows one address hammering one
// account. It does NOT catch one address trying a password against many
// accounts (each pair gets its own counter) - `loginIpLimiter` below does.
//
// The limit is intentionally HIGHER than MAX_LOGIN_ATTEMPTS. Both controls
// guard the same endpoint, and the limiter runs first, so if the two
// thresholds matched, the 6th attempt would be absorbed here as a 429 and the
// account-lockout 423 that US-004 specifies could never be observed. The
// lockout is the precise, account-scoped control and must fire first; this
// limiter is the crude flood backstop behind it.
const loginLimiter = rateLimit({
  windowMs: env.LOCK_TIME_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const employeeId = (req.body && req.body.employeeId ? String(req.body.employeeId) : '').toUpperCase();
    return `${req.ip}:${employeeId}`;
  },
  // Only failures count. A user who logs in successfully five times in a
  // morning should not be locked out of the sixth.
  skipSuccessfulRequests: true,
  // Off by default in tests, since most suites drive many logins from one
  // address. The dedicated limiter suite opts back in with this flag so the
  // interaction between the limiter and the lockout is still covered.
  skip: () => env.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true',
  handler: (req, res) => res.status(TOO_MANY_REQUESTS).json(envelope(req)),
});

// Password spraying: one address trying a common password against many
// accounts, staying under each account's lockout. Counted per IP across all
// accounts. Only failures count, and the bar is set well above one person's
// mistakes so a classroom behind one shared address is not blocked.
const loginIpLimiter = rateLimit({
  windowMs: env.LOCK_TIME_MINUTES * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `login-ip:${req.ip}`,
  skipSuccessfulRequests: true,
  skip: () => env.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true',
  handler: (req, res) => res.status(TOO_MANY_REQUESTS).json(envelope(req)),
});

// Step-up and change-password both check the current password, and neither
// goes through the login lockout. Without this, someone holding a stolen
// session could guess the account's password as fast as they liked. Keyed on
// the signed-in user, so it must run after `authenticate`.
const passwordCheckLimiter = rateLimit({
  windowMs: env.LOCK_TIME_MINUTES * 60 * 1000,
  limit: env.MAX_LOGIN_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user ? req.user._id.toString() : req.ip}`,
  skipSuccessfulRequests: true,
  skip: () => env.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true',
  handler: (req, res) => res.status(TOO_MANY_REQUESTS).json(envelope(req)),
});

// A wide backstop for the rest of the API, generous enough that normal SPA
// usage never notices it.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (req, res) => res.status(TOO_MANY_REQUESTS).json(envelope(req)),
});

module.exports = { loginLimiter, loginIpLimiter, passwordCheckLimiter, globalLimiter };
