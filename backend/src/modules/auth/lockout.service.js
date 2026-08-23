const env = require('../../config/env');
const User = require('../../models/User');
const { minutesFromNow, minutesUntil } = require('../../utils/date.util');

// Account lockout, UC-02 5a / US-004. Deliberately kept as its own module: the
// counting rules are fiddly enough to deserve their own unit tests, and the
// login service reads better when it just asks "is this locked?" and "record a
// failure".

const isLocked = (user) => !!(user.lockedUntil && user.lockedUntil.getTime() > Date.now());

const lockRemainingMinutes = (user) => minutesUntil(user.lockedUntil);

// Returns { locked, lockedUntil, attempts }. `locked` is true only on the
// transition, so the caller knows when to send the notification email and
// write AUTH_ACCOUNT_LOCKED exactly once rather than on every later attempt.
const registerFailure = async (user) => {
  const attempts = (user.failedLoginAttempts || 0) + 1;

  if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = minutesFromNow(env.LOCK_TIME_MINUTES);

    // The counter resets alongside the lock. After the window expires the user
    // gets a fresh set of attempts rather than being re-locked by their very
    // next mistake.
    await User.updateOne({ _id: user._id }, { failedLoginAttempts: 0, lockedUntil });

    return { locked: true, lockedUntil, attempts };
  }

  await User.updateOne({ _id: user._id }, { failedLoginAttempts: attempts });
  return { locked: false, lockedUntil: null, attempts };
};

// Called on a successful password check. Clears the counter, releases any
// expired lock, and stamps the login time (UC-02 main flow, step 6).
const registerSuccess = (user) =>
  User.updateOne(
    { _id: user._id },
    { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
  );

const remainingAttempts = (user) =>
  Math.max(0, env.MAX_LOGIN_ATTEMPTS - (user.failedLoginAttempts || 0));

module.exports = { isLocked, lockRemainingMinutes, registerFailure, registerSuccess, remainingAttempts };
