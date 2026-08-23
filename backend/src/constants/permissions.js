const { ROLES } = require('./roles');

// ---------------------------------------------------------------------------
// The RBAC single source of truth - spec section 3.3, encoded as data.
// ---------------------------------------------------------------------------
//
// Routes declare the CAPABILITY they need, never the roles that happen to have
// it today:
//
//     router.get('/dashboard', authenticate,
//       requireCapability(CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT), handler);
//
// Two things fall out of that. The spec's permission table can be asserted
// cell by cell against this one map, and moving a capability between roles is
// a one-line change here rather than a hunt through every router.

const CAPABILITIES = Object.freeze({
  // --- Available to every authenticated user ---
  SELF_PASSWORD_CHANGE: 'SELF_PASSWORD_CHANGE',
  POLICY_VIEW_ASSIGNED: 'POLICY_VIEW_ASSIGNED',
  POLICY_ACKNOWLEDGE: 'POLICY_ACKNOWLEDGE',
  COMPLIANCE_VIEW_SELF: 'COMPLIANCE_VIEW_SELF',
  TRAINING_COMPLETE: 'TRAINING_COMPLETE',
  INCIDENT_SUBMIT: 'INCIDENT_SUBMIT',
  INCIDENT_VIEW_OWN: 'INCIDENT_VIEW_OWN',

  // --- Manager and above ---
  COMPLIANCE_VIEW_DEPARTMENT: 'COMPLIANCE_VIEW_DEPARTMENT',
  REMINDER_SEND: 'REMINDER_SEND',
  REPORT_EXPORT: 'REPORT_EXPORT',
  SIMULATION_VIEW_RESULTS: 'SIMULATION_VIEW_RESULTS',

  // --- Admin only ---
  COMPLIANCE_VIEW_ORGANISATION: 'COMPLIANCE_VIEW_ORGANISATION',
  POLICY_AUTHOR: 'POLICY_AUTHOR',
  TRAINING_AUTHOR: 'TRAINING_AUTHOR',
  INCIDENT_TRIAGE: 'INCIDENT_TRIAGE',
  USER_MANAGE: 'USER_MANAGE',
  AUDIT_VIEW: 'AUDIT_VIEW',
  SIMULATION_MANAGE: 'SIMULATION_MANAGE',
});

const EMPLOYEE_CAPABILITIES = [
  CAPABILITIES.SELF_PASSWORD_CHANGE,
  CAPABILITIES.POLICY_VIEW_ASSIGNED,
  CAPABILITIES.POLICY_ACKNOWLEDGE,
  CAPABILITIES.COMPLIANCE_VIEW_SELF,
  CAPABILITIES.TRAINING_COMPLETE,
  CAPABILITIES.INCIDENT_SUBMIT,
  CAPABILITIES.INCIDENT_VIEW_OWN,
];

// The roles happen to nest today, but they are spread explicitly rather than
// expressed as a hierarchy. A hierarchy quietly grants every future
// employee-level capability to admins too, which is not always wanted - and
// the spec's matrix is a table, not a ladder.
const MANAGER_CAPABILITIES = [
  ...EMPLOYEE_CAPABILITIES,
  CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT,
  CAPABILITIES.REMINDER_SEND,
  CAPABILITIES.REPORT_EXPORT,
  CAPABILITIES.SIMULATION_VIEW_RESULTS,
];

const ADMIN_CAPABILITIES = [
  ...MANAGER_CAPABILITIES,
  CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION,
  CAPABILITIES.POLICY_AUTHOR,
  CAPABILITIES.TRAINING_AUTHOR,
  CAPABILITIES.INCIDENT_TRIAGE,
  CAPABILITIES.USER_MANAGE,
  CAPABILITIES.AUDIT_VIEW,
  CAPABILITIES.SIMULATION_MANAGE,
];

const ROLE_CAPABILITIES = Object.freeze({
  [ROLES.EMPLOYEE]: Object.freeze(EMPLOYEE_CAPABILITIES),
  [ROLES.MANAGER]: Object.freeze(MANAGER_CAPABILITIES),
  [ROLES.ADMIN]: Object.freeze(ADMIN_CAPABILITIES),
});

const capabilitiesForRole = (role) => ROLE_CAPABILITIES[role] || [];

const roleHasCapability = (role, capability) => capabilitiesForRole(role).includes(capability);

// ---------------------------------------------------------------------------
// Reporting scope
// ---------------------------------------------------------------------------
// Which slice of the organisation a role may read. Distinct from capability:
// a Manager and an Admin can both open a compliance dashboard, but they see
// different amounts of the business.
const SCOPE = Object.freeze({
  SELF: 'SELF',
  DEPARTMENT: 'DEPARTMENT',
  ORGANISATION: 'ORGANISATION',
});

const MAX_SCOPE_FOR_ROLE = Object.freeze({
  [ROLES.EMPLOYEE]: SCOPE.SELF,
  [ROLES.MANAGER]: SCOPE.DEPARTMENT,
  [ROLES.ADMIN]: SCOPE.ORGANISATION,
});

module.exports = {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  capabilitiesForRole,
  roleHasCapability,
  SCOPE,
  MAX_SCOPE_FOR_ROLE,
};
