const mongoose = require('mongoose');

// Spec section 7.13. This doubles as the session table: one live document per
// active session, which is what lets an admin see and kill sessions.
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Only the SHA-256 digest is stored. A database dump therefore yields no
    // usable session credentials, exactly as a password table yields no usable
    // passwords.
    tokenHash: { type: String, required: true, unique: true },

    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null },

    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },

    revokedAt: { type: Date, default: null },

    // The rotation chain. Set when this token is exchanged for a new one;
    // seeing a token that already has a successor means the old value was
    // replayed, which means it leaked.
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshToken', default: null },
  },
  { timestamps: false }
);

// TTL index: Mongo removes expired sessions on its own, so the collection does
// not grow without bound and no cleanup job is needed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.virtual('isActive').get(function isActive() {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
