const { z } = require('zod');

const { ALL_POLICY_CATEGORIES } = require('../../constants/policies');
const { ALL_ROLES, ALL_DEPARTMENTS } = require('../../constants/roles');
const {
  ALL_CONTENT_ITEM_TYPES,
  ALL_QUESTION_TYPES,
  QUESTION_TYPE,
  DEFAULT_TRAINING_DUE_IN_DAYS,
  MAX_CONTENT_ITEMS,
  MAX_QUIZ_QUESTIONS,
} = require('../../constants/training');

// Zod at the route boundary, per NFR-SEC-04, shaped exactly as policy.schemas.js
// is. Every object is `.strict()`, so an extra key is rejected rather than
// quietly dropped - which is what stops { title, quiz, status: "PUBLISHED" }
// from ever reaching a service. The ONLY route that may set `status` is the
// publish route, and it accepts no body at all.

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id.');

const moduleParams = z.object({ id: objectId }).strict();

// "TRN-PHISH-01" (7.8). Uppercased so the unique index sees one canonical form.
const moduleCode = z
  .string()
  .trim()
  .min(3, 'A module code is required.')
  .max(32, 'Module code is too long.')
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9-]*$/.test(value), {
    message: 'Use letters, digits and hyphens only, e.g. TRN-EML-001.',
  });

const title = z.string().trim().min(3, 'A title is required.').max(200, 'Title is too long.');

// --- Content items ----------------------------------------------------------
//
// `itemId` is OPTIONAL and echoed back by the client. An item that arrives with
// one keeps it; an item without gets a fresh nanoid. That is what makes
// reordering safe: the array position changes, the identity does not, and an
// employee's progress record still points at the item they actually finished.
//
// `body` and `mediaUrl` are optional here for the same reason a policy draft may
// be empty - an admin sketches the running order first and writes the content
// afterwards. The PUBLISH route is what insists every item has something in it.
const contentItemInput = z
  .object({
    itemId: z.string().trim().min(1).max(40).optional(),
    type: z.enum(ALL_CONTENT_ITEM_TYPES),
    title,
    body: z.string().trim().max(20000, 'That content item is too long.').optional(),
    mediaUrl: z.string().trim().max(2000).optional(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).nullable().optional(),
  })
  .strict();

// --- Quiz -------------------------------------------------------------------

const optionInput = z
  .object({
    optionId: z.string().trim().min(1).max(40).optional(),
    text: z.string().trim().min(1, 'An option needs text.').max(300),
    isCorrect: z.boolean().default(false),
  })
  .strict();

// The correctness rules the prompt names, enforced at the boundary rather than
// in the builder: a single-choice question with two correct options is not a
// harder question, it is a question that can never be answered correctly, and
// the API has to refuse it whoever is calling.
const questionInput = z
  .object({
    questionId: z.string().trim().min(1).max(40).optional(),
    text: z.string().trim().min(3, 'A question needs text.').max(500),
    type: z.enum(ALL_QUESTION_TYPES),
    options: z.array(optionInput).min(2, 'A question needs at least two options.').max(6),
    explanation: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((question, ctx) => {
    const correct = question.options.filter((option) => option.isCorrect).length;

    const fail = (message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message });

    if (question.type === QUESTION_TYPE.SINGLE_CHOICE && correct !== 1) {
      fail('A single-choice question must have exactly one correct option.');
    }

    if (question.type === QUESTION_TYPE.MULTI_CHOICE && correct < 1) {
      fail('A multiple-choice question must have at least one correct option.');
    }

    if (question.type === QUESTION_TYPE.TRUE_FALSE) {
      if (question.options.length !== 2) fail('A true/false question must have exactly two options.');
      else if (correct !== 1) fail('A true/false question must have exactly one correct option.');
    }
  });

// Every setting is optional so a PATCH carrying only `questions` leaves the
// pass mark alone. Defaults live on the schema (7.8), not here - applying them
// at the boundary would silently reset a customised pass mark to 70 on any
// edit that did not restate it.
const quizInput = z
  .object({
    passMark: z.coerce.number().int().min(1).max(100).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
    // null is meaningful: untimed. Absent means "leave it as it is".
    timeLimitMinutes: z.coerce.number().int().min(1).max(240).nullable().optional(),
    shuffleQuestions: z.boolean().optional(),
    questions: z
      .array(questionInput)
      .max(MAX_QUIZ_QUESTIONS, `A quiz is limited to ${MAX_QUIZ_QUESTIONS} questions.`)
      .optional(),
  })
  .strict();

// --- Module -----------------------------------------------------------------
//
// `status`, `publishedAt`, `publishedBy` and `createdBy` are deliberately
// absent: all derived server-side. Accepting any of them would let a client
// mint a published module - and a published module assigns work to people.
const createModuleSchema = z
  .object({
    title,
    // Optional: the service generates TRN-EML-001 from the category when it is
    // omitted, the same scheme policy codes use.
    code: moduleCode.optional(),
    category: z.enum(ALL_POLICY_CATEGORIES),
    description: z.string().trim().max(1000).optional(),
    estimatedMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
    targetRoles: z.array(z.enum(ALL_ROLES)).max(ALL_ROLES.length).optional(),
    targetDepartments: z.array(z.enum(ALL_DEPARTMENTS)).max(ALL_DEPARTMENTS.length).optional(),
    dueInDays: z.coerce.number().int().min(1).max(365).default(DEFAULT_TRAINING_DUE_IN_DAYS),
    contentItems: z
      .array(contentItemInput)
      .max(MAX_CONTENT_ITEMS, `A module is limited to ${MAX_CONTENT_ITEMS} content items.`)
      .optional(),
    quiz: quizInput.optional(),
  })
  .strict();

// Every field optional, but at least one present - a PATCH that says nothing is
// a client bug, not a no-op worth pretending succeeded.
const updateModuleSchema = createModuleSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

// Deliberately empty, like the acknowledge schema. Publishing takes no
// arguments: what is published is what was authored.
const publishModuleSchema = z.object({}).strict();

module.exports = {
  moduleParams,
  createModuleSchema,
  updateModuleSchema,
  publishModuleSchema,
};
