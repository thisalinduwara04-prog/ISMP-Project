const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');
const env = require('../../config/env');
const { AUDIT_ACTIONS, AUDIT_OUTCOME, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');

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

// ---------------------------------------------------------------------------
// Read side (spec section 8.7)
// ---------------------------------------------------------------------------

// The module's own projection. The whole entry is admin-only and none of the
// ~30 writers put password material or a quiz answer key in `metadata`, so it
// passes through as it was recorded - a redacted audit trail is not one.
const toAuditView = (entry) => {
  // `actorId` is populated where the account still exists. A leaver's account
  // is deactivated rather than deleted (7.18), so a dangling reference means
  // somebody deleted a row by hand; the entry still has to render, and
  // `actorRole` survives on it to say what kind of account it was.
  const populated = entry.actorId && entry.actorId.fullName ? entry.actorId : null;

  return {
    id: entry._id.toString(),
    timestamp: entry.timestamp,
    actor: populated
      ? {
          id: populated._id.toString(),
          fullName: populated.fullName,
          employeeId: populated.employeeId,
          department: populated.department,
          role: populated.role,
        }
      : null,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ? entry.entityId.toString() : null,
    outcome: entry.outcome,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
    metadata: entry.metadata || {},
  };
};

/**
 * Browse the log (UC "view the system audit log", admin only).
 *
 * Reading the log is itself recorded, for the same reason the acknowledgement
 * trail records who inspected it: an audit trail nobody can audit is half a
 * control. The entry is written AFTER the query, so a request never reports
 * itself, and once per request including page-flips - "who read what, when" is
 * the point of it.
 */
const listEntries = async (query, actor, req) => {
  const { from, to, action, outcome, actorId, page = 1, limit = 50 } = query || {};

  const filter = {
    ...(action ? { action } : {}),
    ...(outcome ? { outcome } : {}),
    ...(actorId ? { actorId } : {}),
    ...(from || to
      ? { timestamp: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } }
      : {}),
  };

  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'fullName employeeId department role'),
    AuditLog.countDocuments(filter),
  ]);

  await recordForUser(actor, {
    action: AUDIT_ACTIONS.AUDIT_LOG_VIEWED,
    entityType: null,
    // The filters are the interesting part: "who went looking for failed
    // logins by this person, on this date" is a different act from browsing.
    metadata: {
      filters: {
        ...(from ? { from: from.toISOString() } : {}),
        ...(to ? { to: to.toISOString() } : {}),
        ...(action ? { action } : {}),
        ...(outcome ? { outcome } : {}),
        ...(actorId ? { actorId: actorId.toString() } : {}),
      },
      page,
      resultCount: entries.length,
      total,
    },
    req,
  });

  return {
    entries: entries.map(toAuditView),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
};

/**
 * The values worth offering in the filter dropdowns, taken from what the log
 * ACTUALLY contains rather than from `constants/auditActions.js`.
 *
 * That distinction is the point. M4 and M5 write to this database from their
 * own branches, so building the list from our own enum would hide their entries
 * from the only screen that can show them - and keep hiding whatever lands
 * next. Read from the data, the screen needs no change as branches merge.
 *
 * Not audited: this returns no evidence, only the shape of the filter controls.
 */
const listFilterOptions = async () => {
  const [actions, actorIds] = await Promise.all([
    AuditLog.distinct('action'),
    AuditLog.distinct('actorId'),
  ]);

  const ids = actorIds.filter(Boolean);
  const actors = ids.length
    ? await User.find({ _id: { $in: ids } })
        .select('fullName employeeId department role')
        .sort({ fullName: 1 })
    : [];

  return {
    actions: actions.filter(Boolean).sort(),
    actors: actors.map((user) => ({
      id: user._id.toString(),
      fullName: user.fullName,
      employeeId: user.employeeId,
      department: user.department,
      role: user.role,
    })),
  };
};

module.exports = { record, recordForUser, listEntries, listFilterOptions, toAuditView };
