const AppError = require('../utils/AppError');

// Validates req.body against a Zod schema, replacing req.body with the
// parsed (and type-coerced) result on success, or forwarding a 400 with a
// readable summary of the first failing field on failure.
const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first.path.join('.') || 'value';
    return next(new AppError(`Invalid ${field}: ${first.message}`, 400));
  }
  req.body = result.data;
  return next();
};

module.exports = { validateBody };
