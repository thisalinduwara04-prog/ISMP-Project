const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ALL_ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    department: {
      type: String,
      required: true,
      enum: ALL_ROLES,
      // Human-friendly department label, independent of access role.
      // Kept separate from `role` below so an admin account can still be
      // tagged with the real department the person works in.
    },
    role: { type: String, required: true, enum: ALL_ROLES, default: 'sales' },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },

    // --- Brute-force protection ---
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

userSchema.virtual('isLocked').get(function isLocked() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    employeeId: this.employeeId,
    email: this.email,
    department: this.department,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
};

module.exports = mongoose.model('User', userSchema);
