const mongoose = require('mongoose');

// Records that a specific user has read & digitally acknowledged a specific
// version of a policy. A new policy version means employees must
// re-acknowledge, which is what the compliance dashboard tracks.
const policyAcknowledgmentSchema = new mongoose.Schema(
  {
    policy: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },
    versionNumber: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acknowledgedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A user can only acknowledge a given policy version once.
policyAcknowledgmentSchema.index({ policy: 1, versionNumber: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PolicyAcknowledgment', policyAcknowledgmentSchema);
