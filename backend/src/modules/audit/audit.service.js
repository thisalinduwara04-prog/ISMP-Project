const AuditLog = require('../../models/AuditLog');
const env = require('../../config/env');
const { AUDIT_OUTCOME } = require('../../constants/auditActions');

// Writing an audit entry must never be able to fail the operation it is
// recording. A user who successfully logs in should not receive a 500 because
// the log write failed - the failure is reported to the server log instead.
const record = async ({
  action,
  outcome = AUDIT_OUTCOME.SUCCESS,
  actorId = null,
  actorRole = 'ANONYMOUS',
  entityType = null,
  entityId = null,
  metadata = {},
  req = null,
}) => {
  try {
    return await AuditLog.create({
      action,
      outcome,
      actorId,
      actorRole,
      entityType,
      entityId,
      metadata,
      ipAddress: req ? req.ip : null,
      userAgent: req ? req.get('user-agent') || null : null,
      requestId: req ? req.id : null,
    });
  } catch (error) {
    if (!env.isTest) {
      // eslint-disable-next-line no-console
      console.error('[audit] Failed to write audit entry', { action, error: error.message });
    }
    return null;
  }
};

// Convenience wrapper for the common case of auditing an authenticated actor.
const recordForUser = (user, options) =>
  record({
    ...options,
    actorId: user ? user._id : null,
    actorRole: user ? user.role : 'ANONYMOUS',
  });

module.exports = { record, recordForUser };
