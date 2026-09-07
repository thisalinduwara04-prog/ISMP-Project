const Incident = require('../../models/Incident');
const User = require('../../models/User');
const AppAssert = require('../../utils/AppAssert');
const AppError = require('../../utils/AppError');
const AppErrorCode = require('../../constants/appErrorCode');
const { BAD_REQUEST, NOT_FOUND } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_OUTCOME, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { CAPABILITIES, roleHasCapability } = require('../../constants/permissions');
const {
  DEFAULT_SEVERITY_BY_TYPE,
  SEVERITY_SET_BY,
  SEVERITY_RANK,
  INCIDENT_STATUS,
  ALLOWED_STATUS_TRANSITIONS,
  STATUSES_REQUIRING_NOTE,
  ESCALATION_SEVERITIES,
} = require('../../constants/incidents');

const audit = require('../audit/audit.service');
const attachments = require('./attachment.service');
const { withReference } = require('./reference.service');

// Whether this caller is a triager (admin) rather than a reporter. Read from
// the role via the capability table, never from a hardcoded role check, so a
// permissions change lands here automatically.
const canTriage = (user) => roleHasCapability(user.role, CAPABILITIES.INCIDENT_TRIAGE);

// Spec section 8.9: 404 covers "not found, OR hidden from this caller by
// scope". Returning 403 here would confirm to an employee that an incident with
// that id exists, which is exactly what UC-25 ("reporter never sees other
// people's incidents") is guarding.
const notFound = () =>
  new AppError(NOT_FOUND, 'Incident not found.', AppErrorCode.NOT_FOUND);

const isOwner = (incident, user) => {
  // reportedBy may be an ObjectId or a populated document.
  const reporterId = incident.reportedBy?._id || incident.reportedBy;
  return reporterId.toString() === user._id.toString();
};

const serialise = (incident, user) =>
  canTriage(user) ? incident.toTriageJSON() : incident.toReporterJSON();

// Loads an incident the caller is allowed to see, or throws 404.
const loadVisible = async (id, user) => {
  const incident = await Incident.findById(id)
    .populate('reportedBy', 'fullName employeeId department')
    .populate('assignedTo', 'fullName employeeId department')
    .populate('statusHistory.changedBy', 'fullName employeeId department');

  if (!incident) throw notFound();
  if (!canTriage(user) && !isOwner(incident, user)) throw notFound();

  return incident;
};

// ---------------------------------------------------------------------------
// UC-22 Submit a security incident report
// ---------------------------------------------------------------------------
const submit = async (payload, file, context = {}) => {
  const { req, user } = context;

  // Validated and written to disk BEFORE the incident is created, so a rejected
  // file fails the request outright (415) rather than leaving a half-made
  // report behind. The employee can resubmit without the attachment.
  let attachment = null;
  if (file) {
    try {
      attachment = await attachments.store(file);
    } catch (error) {
      await audit.record({
        action: AUDIT_ACTIONS.INCIDENT_ATTACHMENT_REJECTED,
        outcome: AUDIT_OUTCOME.FAILURE,
        actorId: user._id,
        actorRole: user.role,
        entityType: AUDIT_ENTITY_TYPE.INCIDENT,
        metadata: { fileName: file.originalname, sizeBytes: file.size },
        req,
      });
      throw error;
    }
  }

  // US-037: severity comes from the type map, and is recorded as a system
  // judgement so a later admin override is visibly an override.
  const severity = DEFAULT_SEVERITY_BY_TYPE[payload.type];

  const incident = await withReference((reference) =>
    Incident.create({
      reference,
      reportedBy: user._id,
      reporterDepartment: user.department,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      occurredAt: payload.occurredAt || null,
      severity,
      severitySetBy: SEVERITY_SET_BY.SYSTEM_DEFAULT,
      status: INCIDENT_STATUS.OPEN,
      attachments: attachment ? [attachment] : [],
      statusHistory: [
        {
          fromStatus: null,
          toStatus: INCIDENT_STATUS.OPEN,
          changedBy: user._id,
          changedAt: new Date(),
          note: 'Reported by employee.',
        },
      ],
    })
  );

  await audit.record({
    action: AUDIT_ACTIONS.INCIDENT_SUBMITTED,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user._id,
    actorRole: user.role,
    entityType: AUDIT_ENTITY_TYPE.INCIDENT,
    entityId: incident._id,
    metadata: {
      reference: incident.reference,
      type: incident.type,
      severity: incident.severity,
      hasAttachment: Boolean(attachment),
    },
    req,
  });

  // The reporter's own view, even for an admin filing a report: they get the
  // reference and confirmation, which is all UC-22 step 8 asks for.
  return incident.toReporterJSON();
};

// ---------------------------------------------------------------------------
// UC-25 / UC-23 List
// ---------------------------------------------------------------------------
const list = async (filters = {}, context = {}) => {
  const { user } = context;
  const triager = canTriage(user);

  // The scope rule, and the one thing worth reading twice. Spec section 8.6 is
  // "all for ADMIN, own for everyone else" - incidents are deliberately NOT
  // department-scoped, so a Manager sees only their own reports here even
  // though they see their whole department on the compliance dashboard. A
  // security report may well be about a colleague, or about the manager.
  const query = triager ? {} : { reportedBy: user._id };

  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.severity) query.severity = filters.severity;
  if (filters.q) {
    // Escaped so a user searching for "a.b" does not get a wildcard.
    const term = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ reference: term }, { title: term }];
  }

  const incidents = await Incident.find(query)
    .populate('reportedBy', 'fullName employeeId department')
    .populate('assignedTo', 'fullName employeeId department')
    .sort({ createdAt: -1 })
    .limit(500);

  // Severity is stored as a word, so Mongo cannot sort it by seriousness. The
  // triage queue is small enough (spec section 7.2: ~100 a year) to order in
  // memory: open work first, most serious first, oldest first within that -
  // which is the order an admin actually works the queue in.
  if (triager) {
    const statusOrder = [
      INCIDENT_STATUS.OPEN,
      INCIDENT_STATUS.IN_REVIEW,
      INCIDENT_STATUS.RESOLVED,
      INCIDENT_STATUS.CLOSED,
    ];
    incidents.sort(
      (a, b) =>
        statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        a.createdAt - b.createdAt
    );
  }

  const items = incidents.map((incident) => serialise(incident, user));

  // UC-24, in-app half. With no notification module in this build, the alert
  // banner is computed from the same query the queue already ran rather than
  // from a separate feed.
  const escalated = triager
    ? incidents.filter(
        (i) =>
          ESCALATION_SEVERITIES.includes(i.severity) &&
          [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_REVIEW].includes(i.status)
      ).length
    : 0;

  return { items, total: items.length, escalatedOpen: escalated };
};

const getById = async (id, context = {}) => {
  const { user } = context;
  const incident = await loadVisible(id, user);
  return serialise(incident, user);
};

// ---------------------------------------------------------------------------
// UC-23 Triage and progress an incident
// ---------------------------------------------------------------------------
const update = async (id, changes, context = {}) => {
  const { req, user } = context;

  const incident = await Incident.findById(id);
  if (!incident) throw notFound();

  const fromStatus = incident.status;

  // CLOSED is terminal (ALLOWED_STATUS_TRANSITIONS[CLOSED] is empty), and that
  // applies to the whole record, not just its status. Allowing severity or
  // ownership to be edited after closure would let the handling record be
  // rewritten after the fact, which is the opposite of what it is for.
  AppAssert(
    fromStatus !== INCIDENT_STATUS.CLOSED,
    BAD_REQUEST,
    'This incident is closed. Its record can no longer be changed.',
    AppErrorCode.INVALID_STATUS_TRANSITION,
    [{ field: 'status', issue: 'incident_closed' }]
  );

  const statusChanged = Boolean(changes.status) && changes.status !== fromStatus;
  const severityChanged = Boolean(changes.severity) && changes.severity !== incident.severity;
  const assigneeChanged =
    changes.assignedTo !== undefined &&
    (changes.assignedTo || null) !== (incident.assignedTo ? incident.assignedTo.toString() : null);

  if (statusChanged) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus] || [];
    AppAssert(
      allowed.includes(changes.status),
      BAD_REQUEST,
      allowed.length === 0
        ? `A ${fromStatus.toLowerCase()} incident cannot change status.`
        : `An incident cannot move from ${fromStatus} to ${changes.status}. Allowed next: ${allowed.join(', ')}.`,
      AppErrorCode.INVALID_STATUS_TRANSITION,
      [{ field: 'status', issue: 'not_allowed_from_current_status' }]
    );

    // UC-23: closing out the handling of an incident without saying what was
    // done leaves an undefensible record, so the note is mandatory.
    AppAssert(
      !STATUSES_REQUIRING_NOTE.includes(changes.status) || (changes.note && changes.note.length > 0),
      BAD_REQUEST,
      `Add a note explaining the outcome before marking this incident ${changes.status.toLowerCase()}.`,
      AppErrorCode.RESOLUTION_NOTE_REQUIRED,
      [{ field: 'note', issue: 'required_for_this_status' }]
    );
  }

  if (assigneeChanged && changes.assignedTo) {
    const assignee = await User.findById(changes.assignedTo);
    AppAssert(
      assignee && roleHasCapability(assignee.role, CAPABILITIES.INCIDENT_TRIAGE),
      BAD_REQUEST,
      'An incident can only be assigned to an administrator.',
      AppErrorCode.VALIDATION_ERROR,
      [{ field: 'assignedTo', issue: 'not_a_triager' }]
    );
  }

  const previousSeverity = incident.severity;
  const now = new Date();

  if (severityChanged) {
    incident.severity = changes.severity;
    // The original system judgement is never silently lost: it is preserved in
    // the flag, in statusHistory and in the audit log (spec section 7.11).
    incident.severitySetBy = SEVERITY_SET_BY.ADMIN_OVERRIDE;
  }

  if (assigneeChanged) incident.assignedTo = changes.assignedTo || null;

  if (statusChanged) {
    incident.status = changes.status;
    if (changes.status === INCIDENT_STATUS.RESOLVED) {
      incident.resolutionNote = changes.note;
      incident.resolvedAt = now;
    }
    if (changes.status === INCIDENT_STATUS.CLOSED) {
      // Existing note wins. Closing from RESOLVED must not overwrite the
      // explanation of what was actually done with an administrative "closing
      // this off" remark - that note is what the reporter is shown (UC-25).
      // Closing straight from IN_REVIEW has no note yet, so the closing one
      // becomes it.
      incident.resolutionNote = incident.resolutionNote || changes.note;
      incident.closedAt = now;
    }
    if (changes.status === INCIDENT_STATUS.IN_REVIEW) {
      // Reopened: the previous resolution timestamps no longer describe the
      // current state, but the note stays as part of the history.
      incident.resolvedAt = null;
    }
  }

  // One history entry per call, describing everything that changed together.
  // `toStatus` is always set so the trail reads as a sequence of states even
  // when only the severity or owner moved.
  const noteParts = [];
  if (changes.note) noteParts.push(changes.note);
  if (severityChanged) noteParts.push(`Severity changed from ${previousSeverity} to ${incident.severity}.`);
  if (assigneeChanged) noteParts.push(changes.assignedTo ? 'Owner assigned.' : 'Owner cleared.');

  incident.statusHistory.push({
    fromStatus,
    toStatus: incident.status,
    changedBy: user._id,
    changedAt: now,
    note: noteParts.length > 0 ? noteParts.join(' ') : null,
  });

  await incident.save();

  const auditBase = {
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user._id,
    actorRole: user.role,
    entityType: AUDIT_ENTITY_TYPE.INCIDENT,
    entityId: incident._id,
    req,
  };

  if (statusChanged) {
    await audit.record({
      ...auditBase,
      action: AUDIT_ACTIONS.INCIDENT_STATUS_CHANGED,
      metadata: { reference: incident.reference, fromStatus, toStatus: incident.status },
    });
  }
  if (severityChanged) {
    await audit.record({
      ...auditBase,
      action: AUDIT_ACTIONS.INCIDENT_SEVERITY_OVERRIDDEN,
      metadata: {
        reference: incident.reference,
        fromSeverity: previousSeverity,
        toSeverity: incident.severity,
      },
    });
  }
  if (assigneeChanged) {
    await audit.record({
      ...auditBase,
      action: AUDIT_ACTIONS.INCIDENT_ASSIGNED,
      metadata: { reference: incident.reference, assignedTo: changes.assignedTo || null },
    });
  }

  await incident.populate([
    { path: 'reportedBy', select: 'fullName employeeId department' },
    { path: 'assignedTo', select: 'fullName employeeId department' },
    { path: 'statusHistory.changedBy', select: 'fullName employeeId department' },
  ]);

  return incident.toTriageJSON();
};

// ---------------------------------------------------------------------------
// Attachment download
// ---------------------------------------------------------------------------
const getAttachment = async (id, fid, context = {}) => {
  const { req, user } = context;

  const incident = await loadVisible(id, user);

  // Looked up INSIDE this incident's own attachments, so the storage key is
  // never taken from the request. A caller cannot name a file, only pick one
  // that is already attached to a record they are allowed to read.
  const attachment = incident.attachments.id(fid);
  if (!attachment) throw notFound();

  await audit.record({
    action: AUDIT_ACTIONS.INCIDENT_ATTACHMENT_DOWNLOADED,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: user._id,
    actorRole: user.role,
    entityType: AUDIT_ENTITY_TYPE.INCIDENT,
    entityId: incident._id,
    metadata: { reference: incident.reference, fileName: attachment.fileName },
    req,
  });

  return {
    absolutePath: attachments.absolutePathFor(attachment.storageKey),
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
  };
};

module.exports = { submit, list, getById, update, getAttachment };
