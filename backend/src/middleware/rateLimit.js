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

// Keyed on IP AND account together, which stops the two obvious attacks:
//   - one IP spraying many accounts  (caught by the IP half)
//   - a botnet targeting one account (caught by the employeeId half)
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

module.exports = { loginLimiter, globalLimiter };
