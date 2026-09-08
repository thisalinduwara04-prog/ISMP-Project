const mongoose = require('mongoose');

const {
  ALL_POLICY_CATEGORIES,
  ALL_POLICY_STATUSES,
  POLICY_STATUS,
} = require('../constants/policies');

// Spec section 7.5. The policy is the SHELL - the thing that persists across
// revisions ("Acceptable Use Policy" as a concept). The text people actually
// read lives in `policyVersions`, so a rewrite never destroys the record of
// what the previous wording was or who agreed to it (AD-1).
const policySchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required.'], trim: true },

    // Human-readable stable identifier, e.g. "POL-AUP-001". Uppercased on the
    // way in so "pol-aup-001" cannot slip past the unique index as a second
    // document (spec section 7.16).
    code: {
      type: String,
      required: [true, 'Policy code is required.'],
      unique: true,
      trim: true,
      uppercase: true,
    },

    category: {
      type: String,
      required: [true, 'Category is required.'],
      enum: ALL_POLICY_CATEGORIES,
    },

    description: { type: String, trim: true, default: '' },

    // The accountable admin, not the author of any one version.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'An owner is required.'],
    },

    // Points at the single PUBLISHED version. Null while the policy has only
    // ever been a draft, and left pointing at the last published version once
    // the policy is archived, so the evidence trail still resolves.
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PolicyVersion',
      default: null,
    },

    // Archiving is a soft state change: nothing is ever deleted, because
    // compliance evidence must outlive the policy it relates to (7.18).
    status: { type: String, required: true, enum: ALL_POLICY_STATUSES, default: POLICY_STATUS.ACTIVE },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);
