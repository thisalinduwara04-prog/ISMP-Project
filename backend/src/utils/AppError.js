const AppErrorCode = require('../constants/appErrorCode');
const { INTERNAL_SERVER_ERROR } = require('../constants/http');

// An error the API deliberately raises and is willing to describe to the
// caller. Anything that is NOT an AppError is treated as unexpected by the
// error handler and reported generically, so internal failures never leak
// stack traces or driver messages to the client (spec section 8.9, 500 row).
class AppError extends Error {
  constructor(
    statusCode = INTERNAL_SERVER_ERROR,
    message = 'Something went wrong.',
    errorCode = AppErrorCode.INTERNAL_ERROR,
    details = undefined
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
