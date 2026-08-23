const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const AppErrorCode = require('../constants/appErrorCode');
const env = require('../config/env');
const {
  BAD_REQUEST,
  CONFLICT,
  NOT_FOUND,
  INTERNAL_SERVER_ERROR,
} = require('../constants/http');

// Every response leaves through this one shape (spec section 8.9):
//
//   { success: false, error: { code, message, details }, requestId }
//
// ZFit had three competing envelope shapes across its handlers; one shape
// means the frontend has exactly one error path to write.
const buildEnvelope = (requestId, code, message, details) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
  requestId,
});

// Translates Zod's issue list into the flat field/issue pairs the spec's
// `details` array uses.
const zodDetails = (error) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    issue: issue.message,
  }));

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
const errorHandler = (err, req, res, next) => {
  const requestId = req.id;

  if (err instanceof ZodError) {
    return res
      .status(BAD_REQUEST)
      .json(
        buildEnvelope(requestId, AppErrorCode.VALIDATION_ERROR, 'Validation failed.', zodDetails(err))
      );
  }

  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json(buildEnvelope(requestId, err.errorCode, err.message, err.details));
  }

  // Mongoose duplicate key. The offending field name is safe to reveal; the
  // attempted value is not, so it is deliberately omitted.
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res
      .status(CONFLICT)
      .json(
        buildEnvelope(requestId, AppErrorCode.DUPLICATE_RESOURCE, `That ${field} is already in use.`, [
          { field, issue: 'duplicate' },
        ])
      );
  }

  if (err && err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      issue: e.message,
    }));
    return res
      .status(BAD_REQUEST)
      .json(buildEnvelope(requestId, AppErrorCode.VALIDATION_ERROR, 'Validation failed.', details));
  }

  if (err && err.name === 'CastError') {
    return res
      .status(NOT_FOUND)
      .json(buildEnvelope(requestId, AppErrorCode.NOT_FOUND, 'Resource not found.'));
  }

  // Anything reaching here is unexpected. Full detail goes to the server log,
  // a generic message goes to the client (spec section 8.9, 500 row).
  if (!env.isTest) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${requestId} ${req.method} ${req.originalUrl}`, err);
  }

  return res
    .status(INTERNAL_SERVER_ERROR)
    .json(
      buildEnvelope(requestId, AppErrorCode.INTERNAL_ERROR, 'An unexpected error occurred. Please try again.')
    );
};

const notFoundHandler = (req, res) =>
  res
    .status(NOT_FOUND)
    .json(buildEnvelope(req.id, AppErrorCode.NOT_FOUND, `Cannot ${req.method} ${req.originalUrl}`));

module.exports = { errorHandler, notFoundHandler };
