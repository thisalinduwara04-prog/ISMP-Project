// Parses and REPLACES the named request property with the validated result, so
// downstream handlers can only ever see data that passed the schema. Handing
// back the parsed value (rather than validating and then reading the original)
// is what makes `.strict()` and Zod's transforms actually take effect.
const validate = (schema, property = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[property]);

  // Zod errors are shaped into the spec's `details` array by errorHandler.
  if (!result.success) return next(result.error);

  req[property] = result.data;
  return next();
};

module.exports = { validate };
