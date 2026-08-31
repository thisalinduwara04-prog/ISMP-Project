const mongoose = require('mongoose');

const ITEM_TYPE = Object.freeze({ POLICY: 'POLICY', TRAINING: 'TRAINING' });
const ASSIGNMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  OVERDUE: 'OVERDUE',
  SUPERSEDED: 'SUPERSEDED',
});
const ASSIGNMENT_SOURCE = Object.freeze({
  PUBLICATION: 'PUBLICATION',
  MANUAL: 'MANUAL',
  REMEDIAL_SIMULATION: 'REMEDIAL_SIMULATION',
});

const assignmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String, required: true, trim: true, uppercase: true },
    userRole: { type: String, required: true, trim: true, uppercase: true },
    itemType: { type: String, enum: Object.values(ITEM_TYPE), required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemTitle: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(ASSIGNMENT_STATUS),
      default: ASSIGNMENT_STATUS.PENDING,
      required: true,
    },
    assignedAt: { type: Date, default: Date.now, required: true },
    dueDate: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completionRef: { type: mongoose.Schema.Types.ObjectId, default: null },
    progress: {
      completedItemIds: { type: [String], default: [] },
      percentComplete: { type: Number, min: 0, max: 100, default: 0 },
    },
    remindersSent: { type: Number, min: 0, default: 0 },
    lastRemindedAt: { type: Date, default: null },
    source: {
      type: String,
      enum: Object.values(ASSIGNMENT_SOURCE),
      default: ASSIGNMENT_SOURCE.PUBLICATION,
      required: true,
    },
    sourceRef: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

assignmentSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });
assignmentSchema.index({ department: 1, status: 1, itemType: 1 });
assignmentSchema.index({ status: 1, dueDate: 1 });
assignmentSchema.index({ userId: 1, status: 1 });

assignmentSchema.pre('validate', function enforceCompletionFields(next) {
  if (this.status === ASSIGNMENT_STATUS.COMPLETED && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (this.itemType === ITEM_TYPE.POLICY) this.progress = undefined;
  next();
});

module.exports = mongoose.model('Assignment', assignmentSchema);
module.exports.ITEM_TYPE = ITEM_TYPE;
module.exports.ASSIGNMENT_STATUS = ASSIGNMENT_STATUS;
module.exports.ASSIGNMENT_SOURCE = ASSIGNMENT_SOURCE;
