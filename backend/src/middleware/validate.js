// Parses and REPLACES the named request property with the validated result, so
// downstream handlers can only ever see data that passed the schema. Handing
// back the parsed value (rather than validating and then reading the original)
// is what makes `.strict()` and Zod's transforms actually take effect.
const validate = (schema, property = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[property]);

  // Zod errors are shaped into the spec's `details` array by errorHandler.
  if (!result.success) return next(result.error);

  // defineProperty rather than `req[property] = ...`. Express 4 exposes
  // `req.query` as a getter on the request prototype with no setter, so a
  // plain assignment fails SILENTLY in sloppy mode: validation would appear to
  // pass while the handler still read the raw, untransformed query string.
  // Defining an own property shadows the getter and works identically for
  // `body` and `params`.
  Object.defineProperty(req, property, {
    value: result.data,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return next();
};

module.exports = { validate };
