const mongoose = require('mongoose');

const { ALL_ROLES, ROLES, ALL_DEPARTMENTS, ALL_USER_STATUSES, USER_STATUS } = require('../constants/roles');
const { hashPassword, comparePassword } = require('../modules/auth/password.service');

// Spec section 7.4. Note `role` and `department` are independent axes:
// `role` decides what you may do, `department` decides what you are shown and
// which slice of the organisation you can report on.
const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required.'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    fullName: { type: String, required: [true, 'Full name is required.'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address.'],
    },

    // `select: false` means the hash is absent from every query result unless
    // explicitly asked for with `.select('+passwordHash')`. A generic
    // serialiser therefore cannot leak it by accident (spec section 7.4 rules).
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, required: true, enum: ALL_ROLES, default: ROLES.EMPLOYEE },
    department: { type: String, required: true, enum: ALL_DEPARTMENTS },
    jobTitle: { type: String, trim: true },

    status: { type: String, required: true, enum: ALL_USER_STATUSES, default: USER_STATUS.ACTIVE },

    // Set when an admin creates or resets an account. While true, every
    // non-auth route is refused until the temporary password is replaced.
    mustChangePassword: { type: Boolean, default: false },

    // --- Brute-force protection (UC-02 5a, US-004) ---
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    lastLoginAt: { type: Date, default: null },

    // Bumping this invalidates every access and refresh token already issued
    // to the user, in one write (AD-6). Used on deactivation, role change,
    // password change and refresh-token theft.
    tokenVersion: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Spec section 7.16.
userSchema.index({ department: 1, role: 1, status: 1 });

userSchema.virtual('isLocked').get(function isLocked() {
  return !!(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
});

// Hashing lives in a save hook so no caller has to remember it. Assigning a
// plaintext value to `passwordHash` and saving is always correct.
userSchema.pre('save', async function hashIfChanged(next) {
  if (!this.isModified('passwordHash')) return next();
  // Skip work if the value is already a bcrypt digest (e.g. re-saving a
  // document that was loaded with the hash selected).
  if (/^\$2[aby]\$\d{2}\$/.test(this.passwordHash)) return next();

  this.passwordHash = await hashPassword(this.passwordHash);
  return next();
});

userSchema.methods.comparePassword = function compare(candidate) {
  return comparePassword(candidate, this.passwordHash);
};

// The canonical shape sent to clients. Anything not listed here does not leave
// the server, so adding a sensitive field to the schema cannot silently expose
// it through an existing endpoint.
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    employeeId: this.employeeId,
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    department: this.department,
    jobTitle: this.jobTitle,
    status: this.status,
    mustChangePassword: this.mustChangePassword,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
