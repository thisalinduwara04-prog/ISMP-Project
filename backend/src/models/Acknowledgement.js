const mongoose = require('mongoose');

// Spec section 7.7. The legal artefact of the whole platform: proof that a
// named person read one exact revision at one exact moment. Everything about
// this schema follows from that - it is insert-only, it snapshots rather than
// references what it can, and it is never deleted, not even when the policy it
// relates to is archived (7.18).
const acknowledgementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Denormalised so "every acknowledgement for this policy, across all its
    // versions" is one indexed query with no $lookup.
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },

    // The binding reference. This, not policyId, is what the evidence means.
    policyVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PolicyVersion',
      required: true,
    },

    versionNumber: { type: Number, required: true, min: 1 },

    acknowledgedAt: { type: Date, required: true, default: Date.now },

    // Set when the reader opened the version, from the POLICY_VIEWED audit
    // entry rather than from the client, so time spent cannot be faked by
    // posting a flattering number.
    viewOpenedAt: { type: Date, default: null },
    timeSpentSeconds: { type: Number, default: null, min: 0 },

    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    // ref is resolved lazily by Mongoose, so this is safe before M4 registers
    // the Assignment model; only a populate() would need it present.
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
  },
  { timestamps: false }
);

// --- Indexes (spec section 7.16) ---

// This is what makes the acknowledge endpoint idempotent. A double submit
// raises E11000 and the service returns the ORIGINAL record with 200 - no
// pre-flight findOne, so there is no race window between the check and the
// insert (UC-10 6a).
acknowledgementSchema.index({ userId: 1, policyVersionId: 1 }, { unique: true });

// The per-version audit trail, sorted newest first, served from the index
// rather than sorted in memory (UC-12).
acknowledgementSchema.index({ policyVersionId: 1, acknowledgedAt: -1 });

// --- Insert-only ---

const blockMutation = function blockMutation(next) {
  next(new Error('acknowledgements are insert-only: they cannot be updated or deleted.'));
};

// Mirrors the AuditLog guard. No update or delete route exists anywhere in the
// system; this makes an accidental one fail loudly in development rather than
// silently succeed against a permissive local database.
acknowledgementSchema.pre('updateOne', blockMutation);
acknowledgementSchema.pre('updateMany', blockMutation);
acknowledgementSchema.pre('findOneAndUpdate', blockMutation);
acknowledgementSchema.pre('findOneAndReplace', blockMutation);
acknowledgementSchema.pre('replaceOne', blockMutation);
acknowledgementSchema.pre('deleteOne', blockMutation);
acknowledgementSchema.pre('deleteMany', blockMutation);
acknowledgementSchema.pre('findOneAndDelete', blockMutation);

// `.save()` on a document that already exists is an update by another name.
acknowledgementSchema.pre('save', function insertOnly(next) {
  if (this.isNew) return next();
  return next(new Error('acknowledgements are insert-only: an existing record cannot be re-saved.'));
});

module.exports = mongoose.model('Acknowledgement', acknowledgementSchema);
