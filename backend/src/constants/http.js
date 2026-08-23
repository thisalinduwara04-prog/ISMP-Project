// HTTP status codes used by this API, per spec section 8.9.
// Named constants keep `AppAssert(cond, UNAUTHORIZED, ...)` call sites readable.

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
const LOCKED = 423;
const TOO_MANY_REQUESTS = 429;
const INTERNAL_SERVER_ERROR = 500;

module.exports = {
  OK,
  CREATED,
  NO_CONTENT,
  BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
  CONFLICT,
  GONE,
  PAYLOAD_TOO_LARGE,
  UNSUPPORTED_MEDIA_TYPE,
  LOCKED,
  TOO_MANY_REQUESTS,
  INTERNAL_SERVER_ERROR,
};
