const mongoose = require('mongoose');

const { AUDIT_ACTIONS, AUDIT_OUTCOME, AUDIT_ENTITY_TYPE } = require('../constants/auditActions');
const { ALL_ROLES } = require('../constants/roles');

// Spec section 7.14. Append-only: this model deliberately exposes no update or
// delete helper, and the deployed database user is granted insert and find
// only. Evidence that can be edited after the fact is not evidence (AD-4).
const auditLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, required: true },

    // Null for scheduler and system-initiated actions, and for failed logins
    // where no actor was ever established.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: [...ALL_ROLES, 'SYSTEM', 'ANONYMOUS'], default: 'ANONYMOUS' },

    action: { type: String, required: true, enum: Object.values(AUDIT_ACTIONS) },
    entityType: { type: String, enum: Object.values(AUDIT_ENTITY_TYPE), default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },

    outcome: { type: String, required: true, enum: Object.values(AUDIT_OUTCOME) },

    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    requestId: { type: String, default: null },

    // Action-specific context, e.g. { fromStatus, toStatus } or the employee ID
    // that was tried on a failed login. Free-form by design.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
);

// Spec section 7.16.
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

const guard = function blockMutation(next) {
  next(new Error('auditLogs is append-only: entries cannot be updated or deleted.'));
};

// Belt and braces alongside the database-level grant, so an accidental
// `AuditLog.updateOne(...)` in application code fails loudly in development
// rather than silently succeeding against a permissive local database.
auditLogSchema.pre('updateOne', guard);
auditLogSchema.pre('updateMany', guard);
auditLogSchema.pre('findOneAndUpdate', guard);
auditLogSchema.pre('deleteOne', guard);
auditLogSchema.pre('deleteMany', guard);
auditLogSchema.pre('findOneAndDelete', guard);

module.exports = mongoose.model('AuditLog', auditLogSchema);
