const rateLimit = require('express-rate-limit');

// Throttles the login endpoint independently of account-level lockout, to
// slow down credential-stuffing / brute-force attempts against the whole
// user base, not just a single account.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts from this network. Please try again later.' },
});

// A looser general limiter applied to the whole API as defence in depth.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, apiLimiter };
