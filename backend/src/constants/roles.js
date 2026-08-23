// Spec section 3.1 separates two axes that the prototype conflated:
//
//   role       - what you are ALLOWED TO DO (authorisation)
//   department - WHERE YOU WORK (content targeting and reporting scope)
//
// A warehouse supervisor is { role: MANAGER, department: WAREHOUSE }. Keeping
// these independent is what lets RBAC checks stay simple while still allowing
// policies and training to be aimed at one part of the business.

const ROLES = Object.freeze({
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

const DEPARTMENTS = Object.freeze({
  SALES: 'SALES',
  WAREHOUSE: 'WAREHOUSE',
  ADMINISTRATION: 'ADMINISTRATION',
  MANAGEMENT: 'MANAGEMENT',
});

const ALL_DEPARTMENTS = Object.freeze(Object.values(DEPARTMENTS));

const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

const ALL_USER_STATUSES = Object.freeze(Object.values(USER_STATUS));

module.exports = {
  ROLES,
  ALL_ROLES,
  DEPARTMENTS,
  ALL_DEPARTMENTS,
  USER_STATUS,
  ALL_USER_STATUSES,
};
