const AppError = require('../utils/AppError');

// Restricts a route to a specific set of roles. Must run after `protect`.
// Enforced server-side at the API layer (not just hidden in the UI), per
// the non-functional security requirement.
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Not authenticated.', 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  return next();
};

module.exports = { allowRoles };
