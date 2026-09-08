// Actions recorded in the append-only `auditLogs` collection (spec section 7.14).
// Modules add their own entries as they land; the exact strings are a shared
// contract, because M4's audit browser filters on them (T0).

const AUDIT_ACTIONS = Object.freeze({
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE: 'AUTH_LOGIN_FAILURE',
  AUTH_LOGIN_INACTIVE: 'AUTH_LOGIN_INACTIVE',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_TOKEN_REFRESHED: 'AUTH_TOKEN_REFRESHED',
  AUTH_TOKEN_REUSE_DETECTED: 'AUTH_TOKEN_REUSE_DETECTED',
  AUTH_PASSWORD_CHANGED: 'AUTH_PASSWORD_CHANGED',
  RBAC_DENIED: 'RBAC_DENIED',
  RBAC_SCOPE_VIOLATION: 'RBAC_SCOPE_VIOLATION',
  // Distinct from RBAC_SCOPE_VIOLATION, which is a manager reaching for
  // another department's reports. This is someone asking for a policy version
  // they were not targeted by - worth its own filter when reviewing whether an
  // account is probing for documents it should not see (NFR-SEC-06).
  RBAC_SCOPE_VIEW_DENIED: 'RBAC_SCOPE_VIEW_DENIED',

  // M2 - Policy management
  POLICY_PUBLISHED: 'POLICY_PUBLISHED',
  POLICY_VIEWED: 'POLICY_VIEWED',
  POLICY_ACKNOWLEDGED: 'POLICY_ACKNOWLEDGED',
  POLICY_UPDATED: 'POLICY_UPDATED',
  POLICY_ARCHIVED: 'POLICY_ARCHIVED',
  POLICY_RESTORED: 'POLICY_RESTORED',
  // Only ever a DRAFT. A published version cannot be deleted by anyone, so
  // this action can never describe the loss of something acknowledged.
  POLICY_DRAFT_DELETED: 'POLICY_DRAFT_DELETED',
  // A version that had been published. Separate from the draft action because
  // this one can destroy acknowledgements, and the two deserve to be
  // distinguishable when reviewing the log.
  POLICY_VERSION_DELETED: 'POLICY_VERSION_DELETED',
  // Permanent removal of a policy and everything attached to it. The audit
  // entry is all that survives, which is precisely why it records the counts.
  POLICY_DELETED: 'POLICY_DELETED',
  POLICY_ATTACHMENT_ADDED: 'POLICY_ATTACHMENT_ADDED',
  // Who inspected whose compliance evidence, and when. An audit trail that
  // nobody can audit is only half a control (UC-12).
  COMPLIANCE_AUDIT_VIEWED: 'COMPLIANCE_AUDIT_VIEWED',

  // M3 - Training & awareness
  TRAINING_MODULE_CREATED: 'TRAINING_MODULE_CREATED',
  // Covers content and quiz edits alike. The metadata says which of the two
  // changed, because editing a live quiz is the one that needs explaining
  // afterwards.
  TRAINING_MODULE_UPDATED: 'TRAINING_MODULE_UPDATED',
  TRAINING_PUBLISHED: 'TRAINING_PUBLISHED',
  QUIZ_SUBMITTED: 'QUIZ_SUBMITTED',
});

const AUDIT_OUTCOME = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
});

const AUDIT_ENTITY_TYPE = Object.freeze({
  USER: 'USER',
  SESSION: 'SESSION',
  POLICY: 'POLICY',
  POLICY_VERSION: 'POLICY_VERSION',
  TRAINING_MODULE: 'TRAINING_MODULE',
  INCIDENT: 'INCIDENT',
  CAMPAIGN: 'CAMPAIGN',
});

module.exports = { AUDIT_ACTIONS, AUDIT_OUTCOME, AUDIT_ENTITY_TYPE };
