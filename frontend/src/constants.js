// Mirrors backend/src/constants/permissions.js. Used only to decide what to
// render - never to decide what is allowed.
export const CAPABILITIES = {
  SELF_PASSWORD_CHANGE: 'SELF_PASSWORD_CHANGE',
  POLICY_VIEW_ASSIGNED: 'POLICY_VIEW_ASSIGNED',
  POLICY_ACKNOWLEDGE: 'POLICY_ACKNOWLEDGE',
  COMPLIANCE_VIEW_SELF: 'COMPLIANCE_VIEW_SELF',
  TRAINING_COMPLETE: 'TRAINING_COMPLETE',
  INCIDENT_SUBMIT: 'INCIDENT_SUBMIT',
  INCIDENT_VIEW_OWN: 'INCIDENT_VIEW_OWN',
  COMPLIANCE_VIEW_DEPARTMENT: 'COMPLIANCE_VIEW_DEPARTMENT',
  REMINDER_SEND: 'REMINDER_SEND',
  REPORT_EXPORT: 'REPORT_EXPORT',
  SIMULATION_VIEW_RESULTS: 'SIMULATION_VIEW_RESULTS',
  COMPLIANCE_VIEW_ORGANISATION: 'COMPLIANCE_VIEW_ORGANISATION',
  POLICY_AUTHOR: 'POLICY_AUTHOR',
  TRAINING_AUTHOR: 'TRAINING_AUTHOR',
  INCIDENT_TRIAGE: 'INCIDENT_TRIAGE',
  USER_MANAGE: 'USER_MANAGE',
  AUDIT_VIEW: 'AUDIT_VIEW',
  SIMULATION_MANAGE: 'SIMULATION_MANAGE',
};

export const ROLES = { EMPLOYEE: 'EMPLOYEE', MANAGER: 'MANAGER', ADMIN: 'ADMIN' };

export const DEPARTMENT_LABELS = {
  SALES: 'Sales',
  WAREHOUSE: 'Warehouse',
  ADMINISTRATION: 'Administration',
  MANAGEMENT: 'Management',
};

export const ROLE_LABELS = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  ADMIN: 'Administrator',
};

// UC-02 step 8: each role lands somewhere different after signing in.
export const HOME_PATH_BY_ROLE = {
  [ROLES.EMPLOYEE]: '/my-tasks',
  [ROLES.MANAGER]: '/department',
  [ROLES.ADMIN]: '/admin',
};

export const homePathFor = (user) => HOME_PATH_BY_ROLE[user?.role] || '/my-tasks';

// --- Incidents (M5) --------------------------------------------------------
//
// Mirrors backend/src/constants/incidents.js. Display labels and tones only -
// every rule these describe is enforced on the server.

export const INCIDENT_TYPE_LABELS = {
  SUSPICIOUS_EMAIL: 'Suspicious email / phishing',
  LOST_DEVICE: 'Lost or stolen device',
  UNAUTHORISED_ACCESS: 'Unauthorised access',
  DATA_LOSS: 'Data loss or exposure',
  MALWARE: 'Malware or suspicious file',
  OTHER: 'Something else',
};

// Shown under each option on the report form. Staff pick a type faster from an
// example than from a category name.
export const INCIDENT_TYPE_HINTS = {
  SUSPICIOUS_EMAIL: 'An email asking for payment details, credentials or an unexpected attachment.',
  LOST_DEVICE: 'A laptop, phone, tablet or scanner that is missing or was taken.',
  UNAUTHORISED_ACCESS: 'Someone using an account, terminal or area they should not be.',
  DATA_LOSS: 'Information sent to the wrong person, or files that have gone missing.',
  MALWARE: 'An antivirus warning, or a file or machine behaving strangely.',
  OTHER: 'Anything else that did not feel right.',
};

export const SEVERITY_LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const SEVERITY_TONE = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export const STATUS_LABELS = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const STATUS_TONE = {
  OPEN: 'danger',
  IN_REVIEW: 'warning',
  RESOLVED: 'ok',
  CLOSED: 'neutral',
};

// Mirrors ALLOWED_STATUS_TRANSITIONS on the server, so the triage form only
// offers legal next steps. The server re-checks every transition regardless -
// this is a usability affordance, never the control (NFR-SEC-03).
export const ALLOWED_STATUS_TRANSITIONS = {
  OPEN: ['IN_REVIEW', 'RESOLVED'],
  IN_REVIEW: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_REVIEW'],
  CLOSED: [],
};

// A note is mandatory when moving to one of these (UC-23).
export const STATUSES_REQUIRING_NOTE = ['RESOLVED', 'CLOSED'];

// Matches the server's allow-list in backend/src/utils/fileType.js.
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.pdf,.eml,.txt';
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
