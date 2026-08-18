const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ALL_ROLES } = require('../config/constants');

// GET /api/users (admin only)
const listUsers = asyncHandler(async (req, res) => {
  const { department } = req.query;
  const filter = {};
  if (department) filter.department = department;
  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ users: users.map((u) => u.toSafeJSON()) });
});

// PATCH /api/users/:id/role (admin only) - promote/demote, e.g. to admin.
const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!ALL_ROLES.includes(role)) {
    throw new AppError('Invalid role.', 400);
  }
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found.', 404);

  user.role = role;
  await user.save();
  res.json({ user: user.toSafeJSON() });
});

// PATCH /api/users/:id/status (admin only) - activate/deactivate account.
const updateUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found.', 404);

  if (user._id.equals(req.user._id) && isActive === false) {
    throw new AppError('You cannot deactivate your own account.', 400);
  }

  user.isActive = !!isActive;
  await user.save();
  res.json({ user: user.toSafeJSON() });
});

module.exports = { listUsers, updateUserRole, updateUserStatus };
