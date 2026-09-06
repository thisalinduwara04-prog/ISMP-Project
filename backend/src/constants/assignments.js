// Enums for the `assignments` ledger (spec section 7.10).
//
// M4 owns the collection and its Mongoose model. M2 and M3 are the principal
// writers, but write only through `modules/assignment/assignment.service.js`
// (NFR-MNT-01). These constants are the shared vocabulary of that contract, so
// they live in `constants/` rather than inside any one module.

const ASSIGNMENT_ITEM_TYPE = Object.freeze({
  POLICY: 'POLICY',
  TRAINING: 'TRAINING',
});

const ALL_ASSIGNMENT_ITEM_TYPES = Object.freeze(Object.values(ASSIGNMENT_ITEM_TYPE));

const ASSIGNMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  // Materialised by the nightly sweep, not computed per request, so one
  // indexed equality match answers "how many are overdue".
  OVERDUE: 'OVERDUE',
  // Closed because the item it referred to was replaced or retired. Excluded
  // from live compliance figures, retained in the historical record.
  SUPERSEDED: 'SUPERSEDED',
});

const ALL_ASSIGNMENT_STATUSES = Object.freeze(Object.values(ASSIGNMENT_STATUS));

// Statuses that still count as open work for the assignee.
const OPEN_ASSIGNMENT_STATUSES = Object.freeze([
  ASSIGNMENT_STATUS.PENDING,
  ASSIGNMENT_STATUS.IN_PROGRESS,
  ASSIGNMENT_STATUS.OVERDUE,
]);

const ASSIGNMENT_SOURCE = Object.freeze({
  PUBLICATION: 'PUBLICATION',
  MANUAL: 'MANUAL',
  REMEDIAL_SIMULATION: 'REMEDIAL_SIMULATION',
});

const ALL_ASSIGNMENT_SOURCES = Object.freeze(Object.values(ASSIGNMENT_SOURCE));

module.exports = {
  ASSIGNMENT_ITEM_TYPE,
  ALL_ASSIGNMENT_ITEM_TYPES,
  ASSIGNMENT_STATUS,
  ALL_ASSIGNMENT_STATUSES,
  OPEN_ASSIGNMENT_STATUSES,
  ASSIGNMENT_SOURCE,
  ALL_ASSIGNMENT_SOURCES,
};
