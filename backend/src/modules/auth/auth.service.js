const User = require('../../models/User');
const AppAssert = require('../../utils/AppAssert');
const AppError = require('../../utils/AppError');
const AppErrorCode = require('../../constants/appErrorCode');
const { UNAUTHORIZED, LOCKED, BAD_REQUEST } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_OUTCOME, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { USER_STATUS } = require('../../constants/roles');

const audit = require('../audit/audit.service');
const lockout = require('./lockout.service');
const { comparePassword, assertPasswordPolicy, hashPassword, DUMMY_HASH } = require('./password.service');
const {
  signAccessToken,
  issueRefreshToken,
  findRefreshToken,
  revokeAllForUser,
  revokeById,
} = require('./token.service');

// One message and one code for every credential failure. The caller cannot
// tell an unknown employee ID from a wrong password from a deactivated
// account, which is what prevents account enumeration (UC-02, 3a/3b).
const invalidCredentials = () =>
  new AppError(UNAUTHORIZED, 'Invalid employee ID or password.', AppErrorCode.INVALID_CREDENTIALS);

const buildSession = async (user, context) => {
  const authTime = Math.floor(Date.now() / 1000);
  const accessToken = signAccessToken(user, authTime);
  const { value: refreshToken } = await issueRefreshToken(user, { ...context, authTime });
  return { accessToken, refreshToken };
};

// ---------------------------------------------------------------------------
// UC-02 Log in
// ---------------------------------------------------------------------------
const login = async ({ employeeId, password }, context = {}) => {
  const { req } = context;

  const user = await User.findOne({ employeeId }).select(
    '+passwordHash +failedLoginAttempts +lockedUntil'
  );

  // Unknown account: still run a real bcrypt comparison against a throwaway
  // hash. Skipping it would make this branch measurably faster than the
  // wrong-password branch and turn response time into an account oracle.
  if (!user) {
    await comparePassword(password, DUMMY_HASH);
    await audit.record({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
      outcome: AUDIT_OUTCOME.FAILURE,
      metadata: { employeeId, reason: 'UNKNOWN_ACCOUNT' },
      req,
    });
    throw invalidCredentials();
  }

  // Deactivated account. Same generic 401, but explicitly NO failure-counter
  // increment - locking an already-disabled account achieves nothing and would
  // pollute the record of a real leaver (UC-02, 3b).
  if (user.status !== USER_STATUS.ACTIVE) {
    await comparePassword(password, DUMMY_HASH);
    await audit.record({
      action: AUDIT_ACTIONS.AUTH_LOGIN_INACTIVE,
      outcome: AUDIT_OUTCOME.DENIED,
      actorId: user._id,
      actorRole: user.role,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user._id,
      metadata: { employeeId },
      req,
    });
    throw invalidCredentials();
  }

  // Locked accounts are refused BEFORE the password is checked, so a correct
  // password during the lock window still returns 423 (UC-02, 4a).
  if (lockout.isLocked(user)) {
    const minutes = lockout.lockRemainingMinutes(user);
    throw new AppError(
      LOCKED,
      `Account temporarily locked after repeated failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      AppErrorCode.ACCOUNT_LOCKED,
      [{ field: 'lockedUntil', issue: `${minutes}` }]
    );
  }

  const passwordMatches = await user.comparePassword(password);

  if (!passwordMatches) {
    const { locked, attempts } = await lockout.registerFailure(user);

    if (locked) {
      await audit.record({
        action: AUDIT_ACTIONS.AUTH_ACCOUNT_LOCKED,
        outcome: AUDIT_OUTCOME.DENIED,
        actorId: user._id,
        actorRole: user.role,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: user._id,
        metadata: { employeeId, attempts },
        req,
      });
      // The account-locked notification email is dispatched here once the
      // notification module lands (UC-02, 5a). Its absence must never block
      // the response, so it will be fire-and-forget.
    } else {
      await audit.record({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
        outcome: AUDIT_OUTCOME.FAILURE,
        actorId: user._id,
        actorRole: user.role,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: user._id,
        metadata: { employeeId, attempts },
        req,
      });
    }

    // Identical response whether or not this attempt caused the lock, so the
    // attacker learns nothing from the boundary.
    throw invalidCredentials();
  }

  await lockout.registerSuccess(user);
  user.lastLoginAt = new Date();

  const tokens = await buildSession(user, context);

  await audit.record({
    action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user._id,
    actorRole: user.role,
    entityType: AUDIT_ENTITY_TYPE.USER,
    entityId: user._id,
    req,
  });

  return { user: user.toSafeJSON(), ...tokens };
};

// ---------------------------------------------------------------------------
// Refresh - rotation with reuse detection (spec section 7.13)
// ---------------------------------------------------------------------------
const refresh = async (presentedToken, context = {}) => {
  const { req } = context;
  const { status, record } = await findRefreshToken(presentedToken);

  // A token that was already exchanged is being presented a second time. The
  // legitimate holder cannot do this, so the value leaked. Burn every session
  // for the user and bump tokenVersion, which also kills any access token the
  // thief is currently holding.
  if (status === 'REVOKED') {
    await revokeAllForUser(record.userId);
    await User.updateOne({ _id: record.userId }, { $inc: { tokenVersion: 1 } });
    await audit.record({
      action: AUDIT_ACTIONS.AUTH_TOKEN_REUSE_DETECTED,
      outcome: AUDIT_OUTCOME.DENIED,
      actorId: record.userId,
      entityType: AUDIT_ENTITY_TYPE.SESSION,
      entityId: record._id,
      req,
    });
    throw new AppError(
      UNAUTHORIZED,
      'This session has been ended for security reasons. Please log in again.',
      AppErrorCode.REFRESH_TOKEN_REUSED
    );
  }

  AppAssert(
    status === 'ACTIVE',
    UNAUTHORIZED,
    'Your session has expired. Please log in again.',
    status === 'EXPIRED' ? AppErrorCode.SESSION_EXPIRED : AppErrorCode.INVALID_REFRESH_TOKEN
  );

  const user = await User.findById(record.userId);

  // The session outlived the account, or the account was deactivated while the
  // session was idle.
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    await revokeById(record._id);
    throw new AppError(
      UNAUTHORIZED,
      'Your session is no longer valid. Please log in again.',
      AppErrorCode.INVALID_REFRESH_TOKEN
    );
  }

  // Claims are rebuilt from the freshly-loaded user, never copied from the old
  // token. (ZFit's refresh path drops `role` here, which silently breaks every
  // role check after the first refresh.)
  const authTime = record.authTime || Math.floor(record.issuedAt.getTime() / 1000);
  const accessToken = signAccessToken(user, authTime);
  const { value: refreshToken } = await issueRefreshToken(user, {
    ...context,
    replacesId: record._id,
    authTime,
  });

  await audit.record({
    action: AUDIT_ACTIONS.AUTH_TOKEN_REFRESHED,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user._id,
    actorRole: user.role,
    entityType: AUDIT_ENTITY_TYPE.SESSION,
    entityId: record._id,
    req,
  });

  return { user: user.toSafeJSON(), accessToken, refreshToken };
};

// ---------------------------------------------------------------------------
// UC-03 Log out
// ---------------------------------------------------------------------------
const logout = async (presentedToken, context = {}) => {
  const { req, user } = context;

  if (presentedToken) {
    const { record } = await findRefreshToken(presentedToken).catch(() => ({ record: null }));
    if (record) await revokeById(record._id);
  }

  await audit.record({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user ? user._id : null,
    actorRole: user ? user.role : 'ANONYMOUS',
    entityType: AUDIT_ENTITY_TYPE.SESSION,
    req,
  });
};

// ---------------------------------------------------------------------------
// UC-04 Change own password
// ---------------------------------------------------------------------------
const changePassword = async (userId, { currentPassword, newPassword }, context = {}) => {
  const { req } = context;

  const user = await User.findById(userId).select('+passwordHash');
  AppAssert(user, UNAUTHORIZED, 'Account not found.', AppErrorCode.INVALID_ACCESS_TOKEN);

  const matches = await user.comparePassword(currentPassword);
  AppAssert(
    matches,
    UNAUTHORIZED,
    'Your current password is incorrect.',
    AppErrorCode.INVALID_CREDENTIALS
  );

  assertPasswordPolicy(newPassword);

  // Rejecting a no-op change matters most for the forced first-login flow,
  // where "changing" the temporary password to itself would clear
  // mustChangePassword while leaving the emailed credential live.
  const sameAsCurrent = await comparePassword(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    throw new AppError(
      BAD_REQUEST,
      'Your new password must be different from your current one.',
      AppErrorCode.PASSWORD_REUSED,
      [{ field: 'newPassword', issue: 'Must differ from the current password.' }]
    );
  }

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  // Every other session dies. If the password was changed because it may have
  // been exposed, leaving old sessions alive would defeat the point.
  user.tokenVersion += 1;
  await user.save();

  await revokeAllForUser(user._id);

  await audit.record({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user._id,
    actorRole: user.role,
    entityType: AUDIT_ENTITY_TYPE.USER,
    entityId: user._id,
    req,
  });

  // The caller stays logged in on this device: a fresh pair is minted after
  // the version bump, so only the OTHER sessions are affected.
  const tokens = await buildSession(user, context);
  return { user: user.toSafeJSON(), ...tokens };
};

const stepUp = async (userId, password, presentedRefreshToken, context = {}) => {
  const user = await User.findById(userId).select('+passwordHash');
  AppAssert(user, UNAUTHORIZED, 'Account not found.', AppErrorCode.INVALID_ACCESS_TOKEN);
  const matches = await user.comparePassword(password);
  if (!matches) {
    await audit.recordForUser(user, {
      action: AUDIT_ACTIONS.AUTH_STEP_UP_FAILURE,
      outcome: AUDIT_OUTCOME.FAILURE,
      entityType: AUDIT_ENTITY_TYPE.SESSION,
      req: context.req,
    });
    throw invalidCredentials();
  }

  const authTime = Math.floor(Date.now() / 1000);
  if (presentedRefreshToken) {
    const { status, record } = await findRefreshToken(presentedRefreshToken);
    if (status === 'ACTIVE' && record.userId.toString() === user._id.toString()) {
      record.authTime = authTime;
      await record.save();
    }
  }
  await audit.recordForUser(user, {
    action: AUDIT_ACTIONS.AUTH_STEP_UP_SUCCESS,
    entityType: AUDIT_ENTITY_TYPE.SESSION,
    req: context.req,
  });
  return { accessToken: signAccessToken(user, authTime) };
};

module.exports = { login, refresh, logout, changePassword, stepUp };
