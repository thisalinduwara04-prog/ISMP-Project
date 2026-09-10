// Enums and defaults for the training collections (spec sections 7.8 and 7.9).
// Declared here rather than inline in the schemas so the Zod validators, the
// service layer, the seed script and the tests all agree on one spelling -
// the same reason constants/policies.js exists for M2.

const CONTENT_ITEM_TYPE = Object.freeze({
  ARTICLE: 'ARTICLE',
  VIDEO: 'VIDEO',
  WALKTHROUGH: 'WALKTHROUGH',
  PDF: 'PDF',
});

const ALL_CONTENT_ITEM_TYPES = Object.freeze(Object.values(CONTENT_ITEM_TYPE));

// ARTICLE and WALKTHROUGH carry markdown in `body`; VIDEO and PDF point at a
// `mediaUrl`. Keeping the split here lets one validator serve both the schema
// and the authoring API.
const MARKDOWN_CONTENT_TYPES = Object.freeze([
  CONTENT_ITEM_TYPE.ARTICLE,
  CONTENT_ITEM_TYPE.WALKTHROUGH,
]);

const MEDIA_CONTENT_TYPES = Object.freeze([CONTENT_ITEM_TYPE.VIDEO, CONTENT_ITEM_TYPE.PDF]);

const QUESTION_TYPE = Object.freeze({
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
});

const ALL_QUESTION_TYPES = Object.freeze(Object.values(QUESTION_TYPE));

// Modules are edited in place - unlike policies there is no versioning, which
// is why passMarkAtAttempt is snapshotted onto every attempt instead.
const MODULE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
});

const ALL_MODULE_STATUSES = Object.freeze(Object.values(MODULE_STATUS));

const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  // Auto-submitted by the server when a timed quiz ran out; graded like any
  // other attempt, with unanswered questions scoring zero.
  EXPIRED: 'EXPIRED',
});

const ALL_ATTEMPT_STATUSES = Object.freeze(Object.values(ATTEMPT_STATUS));

// Statuses at which an attempt is finished and its record frozen. SUBMITTED is
// the rule stated in spec section 7.9; EXPIRED is included because an attempt
// only reaches it by being graded, and the result is compliance evidence.
// Mirrors FROZEN_VERSION_STATUSES in constants/policies.js.
const TERMINAL_ATTEMPT_STATUSES = Object.freeze([
  ATTEMPT_STATUS.SUBMITTED,
  ATTEMPT_STATUS.EXPIRED,
]);

const DEFAULT_PASS_MARK = 70;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TRAINING_DUE_IN_DAYS = 21;

// A module is bounded, which is what makes embedding content items and the
// quiz in one document safe (7.8). Enforced by the authoring validators.
const MAX_CONTENT_ITEMS = 10;
const MAX_QUIZ_QUESTIONS = 15;

module.exports = {
  CONTENT_ITEM_TYPE,
  ALL_CONTENT_ITEM_TYPES,
  MARKDOWN_CONTENT_TYPES,
  MEDIA_CONTENT_TYPES,
  QUESTION_TYPE,
  ALL_QUESTION_TYPES,
  MODULE_STATUS,
  ALL_MODULE_STATUSES,
  ATTEMPT_STATUS,
  ALL_ATTEMPT_STATUSES,
  TERMINAL_ATTEMPT_STATUSES,
  DEFAULT_PASS_MARK,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TRAINING_DUE_IN_DAYS,
  MAX_CONTENT_ITEMS,
  MAX_QUIZ_QUESTIONS,
};
