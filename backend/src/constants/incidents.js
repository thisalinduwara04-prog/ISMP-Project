// Spec section 7.11. Incident vocabulary, kept out of the model so the schema,
// the Zod boundary and the service layer all agree by construction.

const INCIDENT_TYPE = Object.freeze({
  SUSPICIOUS_EMAIL: 'SUSPICIOUS_EMAIL',
  LOST_DEVICE: 'LOST_DEVICE',
  UNAUTHORISED_ACCESS: 'UNAUTHORISED_ACCESS',
  DATA_LOSS: 'DATA_LOSS',
  MALWARE: 'MALWARE',
  OTHER: 'OTHER',
});

const ALL_INCIDENT_TYPES = Object.freeze(Object.values(INCIDENT_TYPE));

const INCIDENT_SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const ALL_INCIDENT_SEVERITIES = Object.freeze(Object.values(INCIDENT_SEVERITY));

// Severity is stored as a string for readability, so it cannot be sorted
// meaningfully in Mongo on its own. The triage queue sorts on this rank
// instead, projected in with $addFields (spec section 7.16 index intent).
const SEVERITY_RANK = Object.freeze({
  [INCIDENT_SEVERITY.LOW]: 1,
  [INCIDENT_SEVERITY.MEDIUM]: 2,
  [INCIDENT_SEVERITY.HIGH]: 3,
  [INCIDENT_SEVERITY.CRITICAL]: 4,
});

// US-037: the reporter is never asked to judge criticality. Severity is derived
// from the type alone, because an employee who has just lost a laptop is not
// well placed to rate it, and an under-rated report is one that sits in a queue.
const DEFAULT_SEVERITY_BY_TYPE = Object.freeze({
  [INCIDENT_TYPE.LOST_DEVICE]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPE.UNAUTHORISED_ACCESS]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPE.DATA_LOSS]: INCIDENT_SEVERITY.CRITICAL,
  [INCIDENT_TYPE.MALWARE]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPE.SUSPICIOUS_EMAIL]: INCIDENT_SEVERITY.MEDIUM,
  [INCIDENT_TYPE.OTHER]: INCIDENT_SEVERITY.LOW,
});

const SEVERITY_SET_BY = Object.freeze({
  SYSTEM_DEFAULT: 'SYSTEM_DEFAULT',
  ADMIN_OVERRIDE: 'ADMIN_OVERRIDE',
});

const ALL_SEVERITY_SET_BY = Object.freeze(Object.values(SEVERITY_SET_BY));

const INCIDENT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
});

const ALL_INCIDENT_STATUSES = Object.freeze(Object.values(INCIDENT_STATUS));

// UC-23: "Cannot skip from OPEN to CLOSED without a resolution note."
//
// Expressed as data rather than as a conditional in the service. OPEN -> CLOSED
// is simply absent from the graph, so the only route to CLOSED passes through
// RESOLVED, which the service requires a note for. A reopen (RESOLVED ->
// IN_REVIEW) is allowed because a resolution that did not hold is a real case;
// CLOSED is terminal.
const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  [INCIDENT_STATUS.OPEN]: Object.freeze([INCIDENT_STATUS.IN_REVIEW, INCIDENT_STATUS.RESOLVED]),
  [INCIDENT_STATUS.IN_REVIEW]: Object.freeze([INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED]),
  [INCIDENT_STATUS.RESOLVED]: Object.freeze([INCIDENT_STATUS.CLOSED, INCIDENT_STATUS.IN_REVIEW]),
  [INCIDENT_STATUS.CLOSED]: Object.freeze([]),
});

// Statuses that terminate handling and therefore require the admin to say what
// was done (UC-23).
const STATUSES_REQUIRING_NOTE = Object.freeze([
  INCIDENT_STATUS.RESOLVED,
  INCIDENT_STATUS.CLOSED,
]);

// UC-24: HIGH and CRITICAL are the "do not leave this in a queue" band. With no
// notification module in this build, this list drives the in-app alert banner.
const ESCALATION_SEVERITIES = Object.freeze([
  INCIDENT_SEVERITY.HIGH,
  INCIDENT_SEVERITY.CRITICAL,
]);

module.exports = {
  INCIDENT_TYPE,
  ALL_INCIDENT_TYPES,
  INCIDENT_SEVERITY,
  ALL_INCIDENT_SEVERITIES,
  SEVERITY_RANK,
  DEFAULT_SEVERITY_BY_TYPE,
  SEVERITY_SET_BY,
  ALL_SEVERITY_SET_BY,
  INCIDENT_STATUS,
  ALL_INCIDENT_STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
  STATUSES_REQUIRING_NOTE,
  ESCALATION_SEVERITIES,
};
