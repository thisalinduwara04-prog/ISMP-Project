const mongoose = require('mongoose');

const { ALL_ROLES, ALL_DEPARTMENTS } = require('../constants/roles');
const {
  ALL_POLICY_VERSION_STATUSES,
  POLICY_VERSION_STATUS,
  FROZEN_VERSION_STATUSES,
  DEFAULT_POLICY_DUE_IN_DAYS,
} = require('../constants/policies');

// Spec section 7.6. One document per revision, never edited in place once it
// is live. An acknowledgement points at a row in this collection, which is
// what makes "Dilani agreed to the USB clause" a statement about one exact
// wording rather than about whatever the policy happens to say today.
const policyVersionSchema = new mongoose.Schema(
  {
    policyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy',
      required: true,
    },

    versionNumber: { type: Number, required: true, min: 1 },

    // Snapshot of the policy title as it stood, so a later rename of the
    // parent does not silently rewrite history.
    title: { type: String, required: [true, 'Title is required.'], trim: true },

    // Not required at the model, because a DRAFT is work in progress - an
    // admin may attach the signed PDF before typing anything, or publish a
    // policy that lives entirely in the attachment. Publishing enforces that
    // a version has SOMETHING to read: body text, an attached PDF, or both.
    body: { type: String, default: '' },

    // "Added USB storage restriction". Optional for v1 - there is nothing to
    // describe a change from - and required from v2 onward, because a reader
    // being asked to re-acknowledge is entitled to know what changed (UC-08).
    changeNote: {
      type: String,
      trim: true,
      default: '',
      required: [
        function requiredFromV2() {
          return this.versionNumber >= 2;
        },
        'A change note is required from version 2 onward.',
      ],
    },

    attachmentUrl: { type: String, default: null },
    attachmentName: { type: String, default: null },

    // Audience. An EMPTY array means "everyone" - it is not the same as
    // "nobody". A user matches when
    //   (targetRoles is empty OR includes user.role)
    //   AND (targetDepartments is empty OR includes user.department)
    // Filtering happens server-side; a non-targeted user requesting a version
    // by ID gets 403, not a hidden row (NFR-SEC-03).
    targetRoles: { type: [{ type: String, enum: ALL_ROLES }], default: [] },
    targetDepartments: { type: [{ type: String, enum: ALL_DEPARTMENTS }], default: [] },

    status: {
      type: String,
      required: true,
      enum: ALL_POLICY_VERSION_STATUSES,
      default: POLICY_VERSION_STATUS.DRAFT,
    },

    effectiveFrom: { type: Date, default: null },

    // Drives the assignment due date at fan-out: dueDate = publishedAt + this.
    dueInDays: { type: Number, default: DEFAULT_POLICY_DUE_IN_DAYS, min: 1 },

    authoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// --- Indexes (spec section 7.16) ---

// Version history, and the "highest version number so far" lookup that the
// next draft increments from.
policyVersionSchema.index({ policyId: 1, versionNumber: -1 }, { unique: true });

// THE integrity rule of this schema: at most one PUBLISHED version per policy,
// enforced by the database rather than by application code. A partial filter
// is what makes it possible - without it the unique constraint would also
// forbid a second DRAFT or a second SUPERSEDED version, which are both normal.
// Publishing v2 must therefore demote v1 BEFORE promoting v2, or Mongo rejects
// the write. That ordering requirement is a feature: it is impossible to end
// up with two live versions, even under a crash or a race.
policyVersionSchema.index(
  { policyId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: POLICY_VERSION_STATUS.PUBLISHED },
    name: 'one_published_version_per_policy',
  }
);

// "Policies applicable to me". The spec tables this as one compound index
// { status, targetRoles, targetDepartments }, but MongoDB cannot build a
// compound index across two array fields: any version targeting both roles AND
// departments would be rejected at insert time with "cannot index parallel
// arrays". Split into two single-array indexes, which serves the same query -
// the planner picks the more selective one, or intersects them - without
// making a perfectly legal document unsavable. See scripts/verify-policy-indexes.js,
// which proves such a document inserts cleanly.
policyVersionSchema.index({ status: 1, targetRoles: 1 });
policyVersionSchema.index({ status: 1, targetDepartments: 1 });

// --- Immutability (spec section 7.6 rules) ---

// Remember the status the document had when it was loaded. `isModified` alone
// cannot answer "was this already published before this save?", because the
// publish transition itself modifies `status` in the same save.
policyVersionSchema.post('init', function rememberStatus() {
  this.$locals.loadedStatus = this.status;
});

const FROZEN_FIELDS = ['body', 'targetRoles', 'targetDepartments'];

// Once a version is live its text and audience are frozen. Corrections are
// made by publishing a new version, never by editing the one people have
// already agreed to. Enforced here, at the model, so no future service or
// script can quietly bypass it.
policyVersionSchema.pre('save', function freezeOnceLive(next) {
  const wasFrozen = FROZEN_VERSION_STATUSES.includes(this.$locals.loadedStatus);
  if (!wasFrozen) return next();

  const touched = FROZEN_FIELDS.filter((field) => this.isModified(field));
  if (touched.length === 0) return next();

  return next(
    new Error(
      `A ${this.$locals.loadedStatus} policy version is immutable: ` +
        `${touched.join(', ')} cannot be changed. Publish a new version instead.`
    )
  );
});

module.exports = mongoose.model('PolicyVersion', policyVersionSchema);
