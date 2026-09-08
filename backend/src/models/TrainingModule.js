const mongoose = require('mongoose');

const { nanoid } = require('../utils/nanoid');
const { ALL_ROLES, ALL_DEPARTMENTS } = require('../constants/roles');
const { ALL_POLICY_CATEGORIES } = require('../constants/policies');
const {
  ALL_CONTENT_ITEM_TYPES,
  ALL_QUESTION_TYPES,
  ALL_MODULE_STATUSES,
  MODULE_STATUS,
  DEFAULT_PASS_MARK,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TRAINING_DUE_IN_DAYS,
} = require('../constants/training');

// Spec section 7.8. Where a policy keeps its revisions in a separate
// collection - because an acknowledgement has to bind to one exact wording
// (AD-1) - a training module keeps its content items and its quiz EMBEDDED.
// A module is bounded (roughly 10 items, 15 questions) and is always read
// whole, so one document is one read. There is no versioning here; a module is
// edited in place, and past results are protected by the passMarkAtAttempt
// snapshot on each quizAttempt rather than by freezing the module.

// --- Embedded: quiz options and questions ---------------------------------

const optionSchema = new mongoose.Schema(
  {
    optionId: { type: String, default: () => nanoid(), required: true },
    text: { type: String, required: true, trim: true },

    // THE answer key. Stripped by toLearnerView() before any employee-facing
    // response is built (AD-3). It is only ever safe to read from this field
    // inside the service layer, during grading.
    isCorrect: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    // A nanoid, not the array position: an attempt records answers against
    // this, so reordering the quiz later must not repoint an existing answer
    // at a different question.
    questionId: { type: String, default: () => nanoid(), required: true },
    order: { type: Number, required: true, min: 1 },
    text: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ALL_QUESTION_TYPES },
    options: { type: [optionSchema], default: [] },

    // Also part of the answer key in practice - "the second option is wrong
    // because..." names the right one. Revealed only after the final permitted
    // attempt or after a pass, and stripped by toLearnerView everywhere else.
    explanation: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    passMark: { type: Number, default: DEFAULT_PASS_MARK, min: 1, max: 100 },
    maxAttempts: { type: Number, default: DEFAULT_MAX_ATTEMPTS, min: 1 },
    // null = untimed. When set, the deadline is computed from the attempt's
    // startedAt on the SERVER clock, never from anything the client sends.
    timeLimitMinutes: { type: Number, default: null, min: 1 },
    shuffleQuestions: { type: Boolean, default: false },
    questions: { type: [questionSchema], default: [] },
  },
  { _id: false }
);

// --- Embedded: content items ----------------------------------------------

const contentItemSchema = new mongoose.Schema(
  {
    // Referenced by assignment.progress.completedItemIds, so it must outlive
    // any edit or reorder of the module.
    itemId: { type: String, default: () => nanoid(), required: true },
    order: { type: Number, required: true, min: 1 },
    type: { type: String, required: true, enum: ALL_CONTENT_ITEM_TYPES },
    title: { type: String, required: true, trim: true },

    // ARTICLE / WALKTHROUGH markdown. Which of body and mediaUrl is required
    // depends on `type`, and that rule is enforced at the authoring boundary
    // (Zod) rather than here, so a half-built DRAFT can still be saved.
    body: { type: String, default: '' },
    mediaUrl: { type: String, default: null },
    durationSeconds: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

// --- The module -----------------------------------------------------------

const trainingModuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required.'], trim: true },
    code: { type: String, required: [true, 'Code is required.'], trim: true, uppercase: true },
    description: { type: String, default: '', trim: true },

    // "enum matching policy categories" (7.8) - the same list, imported rather
    // than retyped, so a module and a policy about email security file under
    // the same heading in every report.
    category: { type: String, required: true, enum: ALL_POLICY_CATEGORIES },

    estimatedMinutes: { type: Number, default: null, min: 1 },

    // Audience, aimed exactly as a policy version is: an EMPTY array means
    // "everyone", not "nobody". Matching is done by utils/audience.js, which
    // both M2 and M3 import - see the note there on why it is not duplicated.
    targetRoles: { type: [{ type: String, enum: ALL_ROLES }], default: [] },
    targetDepartments: { type: [{ type: String, enum: ALL_DEPARTMENTS }], default: [] },

    status: {
      type: String,
      required: true,
      enum: ALL_MODULE_STATUSES,
      default: MODULE_STATUS.DRAFT,
    },

    // Drives the assignment due date at fan-out: dueDate = publishedAt + this.
    dueInDays: { type: Number, default: DEFAULT_TRAINING_DUE_IN_DAYS, min: 1 },

    contentItems: { type: [contentItemSchema], default: [] },
    quiz: { type: quizSchema, default: () => ({}) },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// --- Indexes (spec section 7.16) ---

trainingModuleSchema.index({ code: 1 }, { unique: true });

// "Training assigned to me". The spec tables one compound index
// { status, targetRoles, targetDepartments }, but MongoDB cannot index two
// array fields in the same compound key: a module targeting both roles AND
// departments - which the SALES-only demo module in M3-T8 is - would be
// rejected at insert time with "cannot index parallel arrays". Split into two
// single-array indexes, exactly as PolicyVersion does for the same reason;
// the planner picks the more selective one or intersects them.
trainingModuleSchema.index({ status: 1, targetRoles: 1 });
trainingModuleSchema.index({ status: 1, targetDepartments: 1 });

module.exports = mongoose.model('TrainingModule', trainingModuleSchema);
