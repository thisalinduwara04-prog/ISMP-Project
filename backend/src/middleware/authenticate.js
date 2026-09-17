const User = require('../models/User');
const AppError = require('../utils/AppError');
const AppErrorCode = require('../constants/appErrorCode');
const asyncHandler = require('../utils/asyncHandler');
const { UNAUTHORIZED, FORBIDDEN } = require('../constants/http');
const { USER_STATUS } = require('../constants/roles');
const { ACCESS_COOKIE } = require('../utils/cookies');
const { verifyAccessToken } = require('../modules/auth/token.service');

// The access token normally arrives as an httpOnly cookie. An Authorization
// header is also accepted so the RBAC negative-path tests, curl and Postman
// can present a token directly - the security posture is unchanged, since a
// header token is one the caller already possessed.
const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies ? req.cookies[ACCESS_COOKIE] : undefined;
};

const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    throw new AppError(UNAUTHORIZED, 'You must be logged in.', AppErrorCode.INVALID_ACCESS_TOKEN);
  }

  const { payload, expired } = verifyAccessToken(token);

  if (!payload) {
    // The client distinguishes these: an expired token means "try refreshing",
    // an invalid one means "log in again".
    throw new AppError(
      UNAUTHORIZED,
      expired ? 'Your session has expired.' : 'Invalid session. Please log in again.',
      expired ? AppErrorCode.ACCESS_TOKEN_EXPIRED : AppErrorCode.INVALID_ACCESS_TOKEN
    );
  }

  // Authority comes from the database, not the token. This is the single most
  // important line in the middleware: a token minted before a role change,
  // deactivation or password change is still cryptographically valid, so role,
  // status and tokenVersion are all re-read on every request.
  const user = await User.findById(payload.sub);

  if (!user || user.status !== USER_STATUS.ACTIVE) {
    throw new AppError(
      UNAUTHORIZED,
      'Your account is no longer active.',
      AppErrorCode.ACCOUNT_INACTIVE
    );
  }

  // One write to users.tokenVersion invalidates every token already issued to
  // this person, taking effect on their very next request (US-007, AD-6).
  if (payload.tokenVersion !== user.tokenVersion) {
    throw new AppError(
      UNAUTHORIZED,
      'Your session has been ended. Please log in again.',
      AppErrorCode.INVALID_ACCESS_TOKEN
    );
  }

  req.user = user;
  req.auth = { authTime: payload.auth_time, tokenVersion: payload.tokenVersion };
  return next();
});

// While a temporary password is outstanding the account can do exactly two
// things: read its own profile, and change its password. Everything else is
// refused, so an admin-issued credential cannot be used for normal work
// (US-003). Mounted after `authenticate` on the protected router.
const requirePasswordChanged = (req, res, next) => {
  if (req.user && req.user.mustChangePassword) {
    return next(
      new AppError(
        FORBIDDEN,
        'You must change your temporary password before continuing.',
        AppErrorCode.PASSWORD_CHANGE_REQUIRED
      )
    );
  }
  return next();
};

const requireRecentAuthentication = (maxAgeMinutes = 30) => (req, res, next) => {
  const authTime = req.auth && req.auth.authTime;
  const ageSeconds = authTime ? Math.floor(Date.now() / 1000) - authTime : Number.POSITIVE_INFINITY;
  if (ageSeconds > maxAgeMinutes * 60) {
    return next(new AppError(
      UNAUTHORIZED,
      'Please confirm your password before viewing organisation-wide compliance data.',
      AppErrorCode.STEP_UP_REQUIRED
    ));
  }
  return next();
};

module.exports = { authenticate, requirePasswordChanged, requireRecentAuthentication, extractToken };
