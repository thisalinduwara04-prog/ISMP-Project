const mongoose = require('mongoose');

const NOTIFICATION_TYPE = Object.freeze({
  REMINDER_DUE: 'REMINDER_DUE',
  REMINDER_OVERDUE: 'REMINDER_OVERDUE',
  REPORT_READY: 'REPORT_READY',
  REPORT_FAILED: 'REPORT_FAILED',
});

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    linkPath: { type: String, default: '/my-tasks' },
    priority: { type: String, enum: ['NORMAL', 'HIGH'], default: 'NORMAL' },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      required: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPE = NOTIFICATION_TYPE;
