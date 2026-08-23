const asyncHandler = require('../../utils/asyncHandler');
const { OK } = require('../../constants/http');
const { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require('../../utils/cookies');
const { capabilitiesFor } = require('../../middleware/authorize');
const authService = require('./auth.service');

// Controllers do HTTP only: read the request, call one service, shape the
// response. No business rules live here.

const requestContext = (req) => ({
  req,
  userAgent: req.get('user-agent') || null,
  ipAddress: req.ip,
});

const ok = (req, data) => ({ success: true, data, requestId: req.id });

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, requestContext(req));

  setAuthCookies(res, { accessToken, refreshToken });

  // Tokens are NOT echoed in the body. They live in httpOnly cookies, so the
  // SPA has nothing to store and XSS has nothing to read.
  return res.status(OK).json(
    ok(req, {
      user,
      capabilities: capabilitiesFor(user),
      mustChangePassword: user.mustChangePassword,
    })
  );
});

const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies[REFRESH_COOKIE];

  const { user, accessToken, refreshToken } = await authService.refresh(presented, requestContext(req));

  setAuthCookies(res, { accessToken, refreshToken });

  // Doubles as the SPA's session-restore call on page load, so it returns the
  // full profile rather than a bare acknowledgement.
  return res.status(OK).json(
    ok(req, {
      user,
      capabilities: capabilitiesFor(user),
      mustChangePassword: user.mustChangePassword,
    })
  );
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[REFRESH_COOKIE], { req, user: req.user });

  clearAuthCookies(res);
  return res.status(OK).json(ok(req, { message: 'Logged out.' }));
});

const me = asyncHandler(async (req, res) =>
  res.status(OK).json(
    ok(req, {
      user: req.user.toSafeJSON(),
      capabilities: capabilitiesFor(req.user),
      mustChangePassword: req.user.mustChangePassword,
    })
  )
);

const changePassword = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.changePassword(
    req.user._id,
    req.body,
    requestContext(req)
  );

  // The change bumped tokenVersion, so the cookies this device is holding are
  // now stale. Replacing them keeps the caller logged in here while every
  // other session is ended.
  setAuthCookies(res, { accessToken, refreshToken });

  return res.status(OK).json(ok(req, { user, capabilities: capabilitiesFor(user) }));
});

module.exports = { login, refresh, logout, me, changePassword };
