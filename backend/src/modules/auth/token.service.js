const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const env = require('../../config/env');
const RefreshToken = require('../../models/RefreshToken');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const { UNAUTHORIZED } = require('../../constants/http');
const { daysFromNow } = require('../../utils/date.util');

// ---------------------------------------------------------------------------
// Access token - a short-lived JWT
// ---------------------------------------------------------------------------

// `role` and `department` are carried for convenience only. Authorisation
// re-reads both from the database on every request (see authenticate), because
// a token minted before a role change would otherwise stay authoritative for
// its full lifetime. `tokenVersion` is the field that makes that check cheap.
const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      department: user.department,
      tokenVersion: user.tokenVersion,
      // Recorded now so step-up re-authentication (UC-06) can later ask "how
      // long ago did this person actually type their password?" without
      // changing the token format.
      auth_time: Math.floor(Date.now() / 1000),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m` }
  );

// Returns { payload } or { error } rather than throwing, so callers can
// distinguish an expired token from a forged one and respond differently.
const verifyAccessToken = (token) => {
  try {
    return { payload: jwt.verify(token, env.JWT_ACCESS_SECRET) };
  } catch (error) {
    return { error: error.message, expired: error.name === 'TokenExpiredError' };
  }
};

// ---------------------------------------------------------------------------
// Refresh token - an opaque random string, not a JWT
// ---------------------------------------------------------------------------
//
// A JWT refresh token is self-validating, so it cannot be revoked before it
// expires without a lookup anyway. Since the lookup is unavoidable, an opaque
// random value is strictly better: it carries no readable claims and is
// useless without the matching database row.

const REFRESH_TOKEN_BYTES = 32;

const generateRefreshTokenValue = () => crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

const hashRefreshToken = (value) => crypto.createHash('sha256').update(value).digest('hex');

const issueRefreshToken = async (user, { userAgent, ipAddress, replacesId = null } = {}) => {
  const value = generateRefreshTokenValue();

  const record = await RefreshToken.create({
    userId: user._id,
    tokenHash: hashRefreshToken(value),
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
    expiresAt: daysFromNow(env.REFRESH_TOKEN_TTL_DAYS),
  });

  if (replacesId) {
    await RefreshToken.findByIdAndUpdate(replacesId, { revokedAt: new Date(), replacedBy: record._id });
  }

  return { value, record };
};

// Revokes every live token belonging to a user. Used on logout-everywhere,
// password change, and on detecting a replayed token.
const revokeAllForUser = (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });

const revokeById = (id) => RefreshToken.findByIdAndUpdate(id, { revokedAt: new Date() });

// Resolves a presented refresh token to its stored record, distinguishing the
// three failure modes that matter:
//
//   unknown  -> forged or already purged; reject
//   revoked  -> REPLAY. The value was used once already, so it leaked. The
//               caller must burn the whole chain (spec section 7.13 rule).
//   expired  -> ordinary session expiry; reject
//
const findRefreshToken = async (value) => {
  AppAssert(value, UNAUTHORIZED, 'Missing refresh token.', AppErrorCode.INVALID_REFRESH_TOKEN);

  const record = await RefreshToken.findOne({ tokenHash: hashRefreshToken(value) });
  if (!record) return { status: 'UNKNOWN', record: null };
  if (record.revokedAt) return { status: 'REVOKED', record };
  if (record.expiresAt.getTime() <= Date.now()) return { status: 'EXPIRED', record };

  return { status: 'ACTIVE', record };
};

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  hashRefreshToken,
  issueRefreshToken,
  findRefreshToken,
  revokeAllForUser,
  revokeById,
  REFRESH_TOKEN_BYTES,
};
