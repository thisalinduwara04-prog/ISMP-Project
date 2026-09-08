const mongoose = require('mongoose');

const { ALL_ROLES, ALL_DEPARTMENTS } = require('../constants/roles');
const {
  ALL_ASSIGNMENT_ITEM_TYPES,
  ALL_ASSIGNMENT_STATUSES,
  ALL_ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SOURCE,
} = require('../constants/assignments');

// Spec section 7.10. The central ledger: every dashboard number in the system
// is an aggregation over this one collection (AD-2).
//
// OWNERSHIP: this collection belongs to M4. It is defined here because M2's
// publish workflow (T4) cannot be demonstrated without a real ledger to write
// into, and its done-when condition requires actual assignments. Only the
// operations M2 needs are implemented in assignment.service.js; the rest of
// that file is still stubbed for M4. If M4 has already written a model, theirs
// wins and this file goes - the service contract is what M2 and M3 depend on,
// not this schema.
const assignmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Denormalised from the user at fan-out time so a dashboard groups by
    // department without a $lookup. Stale by construction; M4 refreshes these
    // when a user transfers or changes role (risk R-03).
    department: { type: String, required: true, enum: ALL_DEPARTMENTS },
    userRole: { type: String, required: true, enum: ALL_ROLES },

    itemType: { type: String, required: true, enum: ALL_ASSIGNMENT_ITEM_TYPES },

    // policyVersionId for POLICY, moduleId for TRAINING. Pointing at the
    // VERSION rather than the policy is what makes "assigned to v1" and
    // "assigned to v2" different obligations.
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemTitle: { type: String, required: true },

    status: {
      type: String,
      required: true,
      enum: ALL_ASSIGNMENT_STATUSES,
      default: ASSIGNMENT_STATUS.PENDING,
    },

    assignedAt: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // The acknowledgement _id or the passing quizAttempt _id - the evidence
    // this assignment was closed by, not just a flag saying it was.
    completionRef: { type: mongoose.Schema.Types.ObjectId, default: null },

    // TRAINING only. Per content item, so a module half-finished on a
    // warehouse terminal resumes on a phone (US-022).
    progress: {
      completedItemIds: { type: [String], default: undefined },
      percentComplete: { type: Number, default: undefined, min: 0, max: 100 },
    },

    remindersSent: { type: Number, default: 0 },
    lastRemindedAt: { type: Date, default: null },

    source: {
      type: String,
      required: true,
      enum: ALL_ASSIGNMENT_SOURCES,
      default: ASSIGNMENT_SOURCE.PUBLICATION,
    },
    sourceRef: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// --- Indexes (spec section 7.16) ---

// A user is never assigned the same item twice. This is the real guarantee
// behind "republishing creates no duplicates" - the fan-out upserts against
// it rather than trusting a pre-flight check (T13).
assignmentSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });

assignmentSchema.index({ department: 1, status: 1, itemType: 1 }); // dashboard aggregation
assignmentSchema.index({ status: 1, dueDate: 1 }); // nightly overdue + reminder sweep
assignmentSchema.index({ userId: 1, status: 1 }); // My Tasks

module.exports = mongoose.model('Assignment', assignmentSchema);
