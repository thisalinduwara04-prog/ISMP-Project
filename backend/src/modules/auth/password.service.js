const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const AppErrorCode = require('../../constants/appErrorCode');
const { BAD_REQUEST } = require('../../constants/http');

const MIN_LENGTH = 8;

// Each rule carries its own message so a failed check can report exactly what
// is missing, and all failures can be returned together.
const POLICY_RULES = [
  { field: 'password', test: (v) => v.length >= MIN_LENGTH, issue: `Must be at least ${MIN_LENGTH} characters long.` },
  { field: 'password', test: (v) => /[A-Z]/.test(v), issue: 'Must contain an uppercase letter.' },
  { field: 'password', test: (v) => /[a-z]/.test(v), issue: 'Must contain a lowercase letter.' },
  { field: 'password', test: (v) => /[0-9]/.test(v), issue: 'Must contain a number.' },
  { field: 'password', test: (v) => /[^A-Za-z0-9]/.test(v), issue: 'Must contain a special character.' },
];

const assertPasswordPolicy = (candidate) => {
  if (typeof candidate !== 'string') {
    throw new AppError(BAD_REQUEST, 'Password is required.', AppErrorCode.WEAK_PASSWORD, [
      { field: 'password', issue: 'Must be a string.' },
    ]);
  }

  const failures = POLICY_RULES.filter((rule) => !rule.test(candidate)).map(({ field, issue }) => ({
    field,
    issue,
  }));

  if (failures.length > 0) {
    throw new AppError(
      BAD_REQUEST,
      'Password does not meet the security policy.',
      AppErrorCode.WEAK_PASSWORD,
      failures
    );
  }
};

const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_COST);

// Never throws. A malformed or absent hash means "does not match", so a user
// document accidentally loaded without `+passwordHash` yields a clean 401
// rather than a 500 that hints at the internal failure.
const comparePassword = (plain, hash) => {
  if (typeof plain !== 'string' || typeof hash !== 'string') return Promise.resolve(false);
  return bcrypt.compare(plain, hash).catch(() => false);
};

// A real bcrypt hash of a value nothing will ever match. Login compares
// against this when the employee ID is unknown, so the unknown-user branch
// costs the same as the wrong-password branch and response timing cannot be
// used to enumerate valid accounts (UC-02, 3a).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), env.BCRYPT_COST);

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIALS = '!@#$%^&*?';

const pick = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];

// Builds one character from each required class first, so the result cannot
// fail the very policy it is about to be checked against, then shuffles so the
// class order is not predictable. Ambiguous glyphs (0/O, 1/l/I) are excluded
// because these are read off a screen and typed by hand.
const generateTemporaryPassword = (length = 14) => {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIALS)];
  const alphabet = UPPER + LOWER + DIGITS + SPECIALS;
  const rest = Array.from({ length: Math.max(length, MIN_LENGTH) - required.length }, () => pick(alphabet));

  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

module.exports = {
  MIN_LENGTH,
  assertPasswordPolicy,
  hashPassword,
  comparePassword,
  generateTemporaryPassword,
  DUMMY_HASH,
};
