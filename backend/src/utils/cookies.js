const env = require('./../config/env');
const { minutesFromNow, daysFromNow } = require('./date.util');

// Both tokens travel as httpOnly cookies (the ZFit pattern). The frontend
// therefore never reads, stores or forwards a token - it just sends
// `credentials: 'include'`, and XSS has nothing to steal.

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

// The refresh cookie is scoped to the only two endpoints that consume it, so
// it is simply not attached to the other ~50 requests the SPA makes. Narrower
// exposure, and it cannot be replayed against an unrelated route.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const baseOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  // `secure` cookies are dropped by the browser over plain http, which would
  // break local development entirely.
  secure: env.isProduction,
});

const accessCookieOptions = () => ({
  ...baseOptions(),
  expires: minutesFromNow(env.ACCESS_TOKEN_TTL_MINUTES),
});

const refreshCookieOptions = () => ({
  ...baseOptions(),
  expires: daysFromNow(env.REFRESH_TOKEN_TTL_DAYS),
  path: REFRESH_COOKIE_PATH,
});

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  if (accessToken) res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  if (refreshToken) res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return res;
};

// clearCookie only matches a cookie whose path and flags line up with the ones
// it was set with, so the refresh cookie must be cleared on its own path.
const clearAuthCookies = (res) =>
  res
    .clearCookie(ACCESS_COOKIE, baseOptions())
    .clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_COOKIE_PATH });

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  accessCookieOptions,
  refreshCookieOptions,
  setAuthCookies,
  clearAuthCookies,
};
