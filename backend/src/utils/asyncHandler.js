// Express 4 does not catch rejections from async handlers, so an unhandled
// promise rejection would hang the request instead of reaching errorHandler.
// Wrapping every async route in this forwards rejections to next().
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
