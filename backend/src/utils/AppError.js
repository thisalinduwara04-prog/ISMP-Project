// A small typed error used to signal an intentional HTTP failure (bad
// request, forbidden, not found, ...) as opposed to an unexpected bug.
// The global error handler uses `statusCode` to shape the HTTP response.
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
