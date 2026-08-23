const assert = require('node:assert');
const AppError = require('./AppError');

// Guard-clause helper, adopted from the ZFit codebase.
//
//   AppAssert(user, UNAUTHORIZED, 'Invalid credentials', INVALID_CREDENTIALS);
//
// reads better than the equivalent if/throw and keeps service functions
// linear - the happy path stays at one indentation level all the way down.
const AppAssert = (condition, statusCode, message, errorCode, details) =>
  assert(condition, new AppError(statusCode, message, errorCode, details));

module.exports = AppAssert;
