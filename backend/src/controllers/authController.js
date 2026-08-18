const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');
const env = require('../config/env');
const { ROLES } = require('../config/constants');

// POST /api/auth/register
// Open self-registration, as specified: "employees to register with name,
// employee ID, department, and role". Self-registration can never create an
// admin account - that must be granted by an existing admin via
// PATCH /api/users/:id/role, keeping the highest-privilege role out of reach
// of the public registration form.
const register = asyncHandler(async (req, res) => {
  const { name, employeeId, email, department, password } = req.body;

  if (department === ROLES.ADMIN) {
    throw new AppError('Cannot self-register as admin.', 403);
  }

  const existing = await User.findOne({ $or: [{ employeeId }, { email }] });
  if (existing) {
    throw new AppError('An account with that employee ID or email already exists.', 409);
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name,
    employeeId,
    email,
    department,
    role: department, // department doubles as the RBAC role for regular staff
    passwordHash,
  });

  const token = generateToken(user);
  res.status(201).json({ token, user: user.toSafeJSON() });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { employeeId, password } = req.body;

  const user = await User.findOne({ employeeId: employeeId.trim().toUpperCase() }).select(
    '+passwordHash +failedLoginAttempts +lockUntil'
  );

  // Constant-ish response whether the account exists or not, to avoid
  // leaking which employee IDs are registered.
  const genericError = new AppError('Invalid employee ID or password.', 401);

  if (!user || !user.isActive) throw genericError;

  if (user.isLocked) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new AppError(
      `Account temporarily locked due to repeated failed attempts. Try again in ${minutesLeft} minute(s).`,
      423
    );
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= env.maxLoginAttempts) {
      user.lockUntil = new Date(Date.now() + env.lockTimeMinutes * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw genericError;
  }

  // Successful login resets lockout counters.
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const token = generateToken(user);
  res.json({ token, user: user.toSafeJSON() });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = { register, login, getMe };
