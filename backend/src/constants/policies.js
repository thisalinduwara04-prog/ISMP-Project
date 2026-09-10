// Enums for the policy collections (spec sections 7.5 and 7.6). Declared here
// rather than inline in the schemas so the Zod validators, the service layer
// and the seed script all agree on one spelling.

const POLICY_CATEGORY = Object.freeze({
  DATA_HANDLING: 'DATA_HANDLING',
  ACCESS_CONTROL: 'ACCESS_CONTROL',
  DEVICE_SECURITY: 'DEVICE_SECURITY',
  EMAIL_SECURITY: 'EMAIL_SECURITY',
  INCIDENT_RESPONSE: 'INCIDENT_RESPONSE',
  GENERAL: 'GENERAL',
});

const ALL_POLICY_CATEGORIES = Object.freeze(Object.values(POLICY_CATEGORY));

const POLICY_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
});

const ALL_POLICY_STATUSES = Object.freeze(Object.values(POLICY_STATUS));

// The version lifecycle. A version moves DRAFT -> PUBLISHED -> SUPERSEDED,
// or DRAFT/PUBLISHED -> ARCHIVED. It never moves backwards.
const POLICY_VERSION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED',
});

const ALL_POLICY_VERSION_STATUSES = Object.freeze(Object.values(POLICY_VERSION_STATUS));

// Statuses at which the content of a version is frozen. PUBLISHED is the rule
// stated in spec section 7.6; SUPERSEDED and ARCHIVED are included because a
// version only reaches them by way of PUBLISHED, and an acknowledgement
// recorded against it is evidence of the text as it stood (BR-01, BR-02).
const FROZEN_VERSION_STATUSES = Object.freeze([
  POLICY_VERSION_STATUS.PUBLISHED,
  POLICY_VERSION_STATUS.SUPERSEDED,
  POLICY_VERSION_STATUS.ARCHIVED,
]);

const DEFAULT_POLICY_DUE_IN_DAYS = 14;

// Short forms used to generate item codes: POL-DAT-003 for a policy,
// TRN-EML-001 for a training module. Here rather than in either service
// because M2 and M3 both file content under the same categories, and two
// copies of this map is how EMAIL_SECURITY ends up abbreviated two ways.
const CATEGORY_ABBREVIATION = Object.freeze({
  [POLICY_CATEGORY.DATA_HANDLING]: 'DAT',
  [POLICY_CATEGORY.ACCESS_CONTROL]: 'ACC',
  [POLICY_CATEGORY.DEVICE_SECURITY]: 'DEV',
  [POLICY_CATEGORY.EMAIL_SECURITY]: 'EML',
  [POLICY_CATEGORY.INCIDENT_RESPONSE]: 'INC',
  [POLICY_CATEGORY.GENERAL]: 'GEN',
});

module.exports = {
  POLICY_CATEGORY,
  ALL_POLICY_CATEGORIES,
  CATEGORY_ABBREVIATION,
  POLICY_STATUS,
  ALL_POLICY_STATUSES,
  POLICY_VERSION_STATUS,
  ALL_POLICY_VERSION_STATUSES,
  FROZEN_VERSION_STATUSES,
  DEFAULT_POLICY_DUE_IN_DAYS,
};
