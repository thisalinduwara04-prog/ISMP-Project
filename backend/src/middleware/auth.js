const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the JWT bearer token, loads the current user, and rejects
// deactivated accounts. Also re-checks the session hasn't outlived the
// token's own expiry (jwt.verify already enforces this, but we keep the
// explicit 401 message consistent with the rest of the API).
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new AppError('Not authenticated. Please log in.', 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw new AppError('Session expired or invalid. Please log in again.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError('Account no longer exists or is deactivated.', 401);
  }

  req.user = user;
  next();
});

module.exports = { protect };
