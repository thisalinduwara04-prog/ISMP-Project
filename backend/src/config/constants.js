// Shared enums used across models, validators and RBAC middleware.

// A user's role doubles as their department for content targeting (training /
// policy audiences) AND as the access-control role. 'admin' is the IT/system
// administrator with full management rights. 'management' can view compliance
// dashboards read-only in addition to their normal employee access.
const ROLES = Object.freeze({
  SALES: 'sales',
  WAREHOUSE: 'warehouse',
  ADMINISTRATION: 'administration',
  MANAGEMENT: 'management',
  ADMIN: 'admin',
});

const ALL_ROLES = Object.values(ROLES);

// Roles allowed to manage policies, training content and incidents.
const ADMIN_ROLES = [ROLES.ADMIN];

// Roles allowed to view the compliance dashboard (read-only for management).
const COMPLIANCE_VIEWER_ROLES = [ROLES.ADMIN, ROLES.MANAGEMENT];

const POLICY_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const INCIDENT_TYPES = Object.freeze({
  PHISHING_EMAIL: 'phishing_email',
  LOST_DEVICE: 'lost_device',
  SUSPICIOUS_ACCESS: 'suspicious_access',
  MALWARE: 'malware',
  DATA_LEAK: 'data_leak',
  OTHER: 'other',
});

const INCIDENT_SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

// Default severity applied when an incident is first reported, before an
// admin triages it. High-risk categories default to a higher severity so
// they surface immediately on the admin dashboard.
const DEFAULT_SEVERITY_BY_TYPE = {
  [INCIDENT_TYPES.PHISHING_EMAIL]: INCIDENT_SEVERITY.MEDIUM,
  [INCIDENT_TYPES.LOST_DEVICE]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPES.SUSPICIOUS_ACCESS]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPES.MALWARE]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPES.DATA_LEAK]: INCIDENT_SEVERITY.HIGH,
  [INCIDENT_TYPES.OTHER]: INCIDENT_SEVERITY.LOW,
};

const INCIDENT_STATUS = Object.freeze({
  OPEN: 'open',
  IN_REVIEW: 'in_review',
  RESOLVED: 'resolved',
});

module.exports = {
  ROLES,
  ALL_ROLES,
  ADMIN_ROLES,
  COMPLIANCE_VIEWER_ROLES,
  POLICY_STATUS,
  INCIDENT_TYPES,
  INCIDENT_SEVERITY,
  DEFAULT_SEVERITY_BY_TYPE,
  INCIDENT_STATUS,
};
