const mongoose = require('mongoose');
const { ALL_ROLES, POLICY_STATUS } = require('../config/constants');

// Each edit to a policy's content creates a new immutable version entry
// rather than overwriting the previous one, so there is always an audit
// trail of what changed, when, and by whom.
const policyVersionSchema = new mongoose.Schema(
  {
    versionNumber: { type: Number, required: true },
    content: { type: String, required: true },
    changeNotes: { type: String, default: '' },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const policySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Empty array = applies to every role/department.
    targetRoles: { type: [String], enum: ALL_ROLES, default: [] },
    status: { type: String, enum: Object.values(POLICY_STATUS), default: POLICY_STATUS.DRAFT },
    versions: { type: [policyVersionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

policySchema.virtual('currentVersion').get(function currentVersion() {
  if (!this.versions.length) return null;
  return this.versions[this.versions.length - 1];
});

policySchema.set('toJSON', { virtuals: true });
policySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Policy', policySchema);
