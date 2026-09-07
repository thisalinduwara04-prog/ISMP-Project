const mongoose = require('mongoose');

const { ALL_ROLES, ALL_DEPARTMENTS } = require('../constants/roles');
const {
  ASSIGNMENT_ITEM_TYPE,
  ALL_ASSIGNMENT_ITEM_TYPES,
  ALL_ASSIGNMENT_STATUSES,
  ALL_ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SOURCE,
} = require('../constants/assignments');

// M4 owns this central ledger. M2 and M3 write through the shared assignment
// service so every screen and report reads the obligations publication wrote.
const assignmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String, required: true, enum: ALL_DEPARTMENTS },
    userRole: { type: String, required: true, enum: ALL_ROLES },
    itemType: { type: String, required: true, enum: ALL_ASSIGNMENT_ITEM_TYPES },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemTitle: { type: String, required: true, trim: true },
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
    completionRef: { type: mongoose.Schema.Types.ObjectId, default: null },
    progress: {
      completedItemIds: { type: [String], default: undefined },
      percentComplete: { type: Number, default: undefined, min: 0, max: 100 },
    },
    remindersSent: { type: Number, min: 0, default: 0 },
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

assignmentSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });
assignmentSchema.index({ department: 1, status: 1, itemType: 1 });
assignmentSchema.index({ status: 1, dueDate: 1 });
assignmentSchema.index({ userId: 1, status: 1 });

assignmentSchema.pre('validate', function enforceStateShape(next) {
  if (this.status === ASSIGNMENT_STATUS.COMPLETED && !this.completedAt) this.completedAt = new Date();
  if (this.itemType === ASSIGNMENT_ITEM_TYPE.POLICY) this.progress = undefined;
  next();
});

const Assignment = mongoose.model('Assignment', assignmentSchema);

// Compatibility aliases for M4 code written before the shared constants file
// landed. New cross-module code imports constants/assignments directly.
Assignment.ITEM_TYPE = ASSIGNMENT_ITEM_TYPE;
Assignment.ASSIGNMENT_STATUS = ASSIGNMENT_STATUS;
Assignment.ASSIGNMENT_SOURCE = ASSIGNMENT_SOURCE;

module.exports = Assignment;
