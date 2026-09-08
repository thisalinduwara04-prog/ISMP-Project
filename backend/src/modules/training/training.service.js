// M3 training service.
//
// This file starts with the one piece of M3 that everything else depends on:
// the projections. AD-3 says the quiz answer key never reaches the client, and
// the defence has to be STRUCTURAL rather than a habit of remembering. So
// there are exactly two ways to turn a module into a response body -
// toAdminView and toLearnerView - and every route uses one of them. Nothing
// returns a raw Mongoose document.
//
// Both are built by explicitly listing the fields that go out, rather than by
// deleting the two dangerous ones from a copy. An allow-list fails safe: a
// field added to the schema later is absent from the learner view until
// somebody deliberately adds it, whereas a deny-list would ship it.
//
// Below the projections: module authoring (T2) and publication (T3).

const mongoose = require('mongoose');

const TrainingModule = require('../../models/TrainingModule');
const QuizAttempt = require('../../models/QuizAttempt');
const User = require('../../models/User');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const audit = require('../audit/audit.service');
const assignmentService = require('../assignment/assignment.service');
const attemptService = require('./attempt.service');
const { nanoid } = require('../../utils/nanoid');
const { withTransaction } = require('../../utils/withTransaction');
const { buildAudienceFilter, matchesAudience, audienceUserFilter } = require('../../utils/audience');
const { BAD_REQUEST, NOT_FOUND, CONFLICT, FORBIDDEN } = require('../../constants/http');
const { ROLES } = require('../../constants/roles');
const { CATEGORY_ABBREVIATION } = require('../../constants/policies');
const {
  ASSIGNMENT_ITEM_TYPE,
  ASSIGNMENT_SOURCE,
  ASSIGNMENT_STATUS,
} = require('../../constants/assignments');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE, AUDIT_OUTCOME } = require('../../constants/auditActions');
const {
  MODULE_STATUS,
  MARKDOWN_CONTENT_TYPES,
  MEDIA_CONTENT_TYPES,
  TERMINAL_ATTEMPT_STATUSES,
} = require('../../constants/training');

const toPlain = (module) =>
  typeof module?.toObject === 'function' ? module.toObject() : module;

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

const toContentItemView = (item) => ({
  itemId: item.itemId,
  order: item.order,
  type: item.type,
  title: item.title,
  body: item.body,
  mediaUrl: item.mediaUrl,
  durationSeconds: item.durationSeconds,
});

// Shared by both views: everything about a module EXCEPT the quiz, which is
// the only part the two disagree about.
const toModuleShell = (m) => ({
  id: m._id.toString(),
  title: m.title,
  code: m.code,
  description: m.description,
  category: m.category,
  estimatedMinutes: m.estimatedMinutes,
  targetRoles: m.targetRoles || [],
  targetDepartments: m.targetDepartments || [],
  status: m.status,
  dueInDays: m.dueInDays,
  contentItems: [...(m.contentItems || [])].sort(byOrder).map(toContentItemView),
  createdBy: m.createdBy ? m.createdBy.toString() : null,
  publishedAt: m.publishedAt || null,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

const toQuizSettings = (quiz) => ({
  passMark: quiz.passMark,
  maxAttempts: quiz.maxAttempts,
  timeLimitMinutes: quiz.timeLimitMinutes,
  shuffleQuestions: quiz.shuffleQuestions,
  questionCount: (quiz.questions || []).length,
});

// --- Admin view: the module as it really is, answer key included -----------
//
// Used by exactly ONE route, GET /training/modules/:id under an ADMIN guard,
// because an admin editing a quiz has to see which option is correct.

const toAdminView = (module) => {
  const m = toPlain(module);
  const quiz = m.quiz || {};

  return {
    ...toModuleShell(m),
    quiz: {
      ...toQuizSettings(quiz),
      questions: [...(quiz.questions || [])].sort(byOrder).map((question) => ({
        questionId: question.questionId,
        order: question.order,
        text: question.text,
        type: question.type,
        options: (question.options || []).map((option) => ({
          optionId: option.optionId,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        explanation: question.explanation,
      })),
    },
  };
};

// --- Learner view: identical, minus the answer key -------------------------
//
// `options.isCorrect` and `question.explanation` are absent - not null, not
// false, absent - so a learner cannot infer an answer from the shape of the
// response either. This is applied on EVERY employee-facing route without
// exception; tests/training.projection.test.js deep-searches the output to
// prove no such key survives anywhere in the tree.
//
// The explanation is revealed separately, by the attempt result path in
// M3-T5/T6, and only after a pass or the final permitted attempt.

const toLearnerView = (module) => {
  const m = toPlain(module);
  const quiz = m.quiz || {};

  return {
    ...toModuleShell(m),
    quiz: {
      ...toQuizSettings(quiz),
      questions: [...(quiz.questions || [])].sort(byOrder).map((question) => ({
        questionId: question.questionId,
        order: question.order,
        text: question.text,
        type: question.type,
        options: (question.options || []).map((option) => ({
          optionId: option.optionId,
          text: option.text,
        })),
      })),
    },
  };
};

// A row on a list screen: enough to choose a module, and never a question, so
// there is nothing here for the answer key to hide in.
const toModuleSummary = (module, { includeAudience = false } = {}) => {
  const m = toPlain(module);
  const quiz = m.quiz || {};

  return {
    id: m._id.toString(),
    title: m.title,
    code: m.code,
    category: m.category,
    description: m.description,
    status: m.status,
    estimatedMinutes: m.estimatedMinutes,
    dueInDays: m.dueInDays,
    contentItemCount: (m.contentItems || []).length,
    questionCount: (quiz.questions || []).length,
    passMark: quiz.passMark,
    maxAttempts: quiz.maxAttempts,
    publishedAt: m.publishedAt || null,
    updatedAt: m.updatedAt,
    ...(includeAudience
      ? {
          audience: {
            roles: m.targetRoles || [],
            departments: m.targetDepartments || [],
            isEveryone: (m.targetRoles || []).length === 0 && (m.targetDepartments || []).length === 0,
          },
        }
      : {}),
  };
};

// --- T2: authoring ----------------------------------------------------------

const isAdmin = (user) => user.role === ROLES.ADMIN;

const isDuplicateKey = (error) => !!error && error.code === 11000;

const notFound = () => new AppError(NOT_FOUND, 'Training module not found.', AppErrorCode.NOT_FOUND);

const dedupe = (values) => [...new Set(values || [])];

const loadModule = async (moduleId) => {
  const module = await TrainingModule.findById(moduleId);
  if (!module) throw notFound();
  return module;
};

// Codes are generated rather than typed, for the same reason policy codes are:
// they must be unique and stable for the life of the module. Shape:
// TRN-<CATEGORY>-<3-digit sequence>, e.g. TRN-EML-001.
const generateCode = async (category) => {
  const prefix = `TRN-${CATEGORY_ABBREVIATION[category] || 'GEN'}`;
  const taken = new Set(
    (await TrainingModule.find({ code: { $regex: `^${prefix}-` } }).select('code')).map((m) => m.code)
  );

  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${prefix}-${Date.now().toString().slice(-6)}`;
};

// ---------------------------------------------------------------------------
// Identity across edits
// ---------------------------------------------------------------------------
// An edit REPLACES the array - that is how a two-pane builder with drag-to-
// reorder works, and diffing on the client would be worse. What must survive
// the replacement is the identity of each item: `progress.completedItemIds`
// holds nanoids, and a quiz attempt's responses hold questionIds. So an id the
// client echoes back is kept if we recognise it, and only an item we have
// never seen is given a fresh one. `order` comes from the array position, so
// reordering is exactly "send them in the new order".

const withStableItemIds = (incoming = [], existing = []) => {
  const known = new Set(existing.map((item) => item.itemId));

  return incoming.map((item, index) => ({
    ...item,
    itemId: item.itemId && known.has(item.itemId) ? item.itemId : nanoid(),
    order: index + 1,
  }));
};

const withStableQuestionIds = (incoming = [], existing = []) => {
  const existingById = new Map(existing.map((question) => [question.questionId, question]));

  return incoming.map((question, index) => {
    const previous = question.questionId ? existingById.get(question.questionId) : null;
    // Option ids are only meaningful within their question, so they are
    // recognised against the question they came from rather than globally.
    const knownOptionIds = new Set((previous ? previous.options || [] : []).map((o) => o.optionId));

    return {
      ...question,
      questionId: previous ? previous.questionId : nanoid(),
      order: index + 1,
      options: question.options.map((option) => ({
        ...option,
        optionId:
          option.optionId && knownOptionIds.has(option.optionId) ? option.optionId : nanoid(),
      })),
    };
  });
};

const createModule = async (payload, actor, req) => {
  const code = payload.code || (await generateCode(payload.category));

  try {
    const module = await TrainingModule.create({
      ...payload,
      code,
      targetRoles: dedupe(payload.targetRoles),
      targetDepartments: dedupe(payload.targetDepartments),
      contentItems: withStableItemIds(payload.contentItems),
      quiz: {
        ...(payload.quiz || {}),
        questions: withStableQuestionIds(payload.quiz ? payload.quiz.questions : []),
      },
      // Always a DRAFT. Publishing is a separate, deliberate act, because it is
      // what assigns work to people (T3).
      status: MODULE_STATUS.DRAFT,
      createdBy: actor._id,
    });

    await audit.recordForUser(actor, {
      action: AUDIT_ACTIONS.TRAINING_MODULE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
      entityId: module._id,
      metadata: { code: module.code, title: module.title },
      req,
    });

    return toAdminView(module);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(
        CONFLICT,
        `Module code ${code} is already in use. Codes identify a module for the life of the system, so each one must be unique.`,
        AppErrorCode.DUPLICATE_RESOURCE,
        [{ field: 'code', issue: 'duplicate' }]
      );
    }
    throw error;
  }
};

const updateModule = async (moduleId, payload, actor, req) => {
  const module = await loadModule(moduleId);

  AppAssert(
    module.status !== MODULE_STATUS.ARCHIVED,
    CONFLICT,
    'This module is archived. Restore it before editing.',
    AppErrorCode.DUPLICATE_RESOURCE
  );

  const { contentItems, quiz, ...fields } = payload;

  Object.assign(module, fields);
  if (fields.targetRoles) module.targetRoles = dedupe(fields.targetRoles);
  if (fields.targetDepartments) module.targetDepartments = dedupe(fields.targetDepartments);

  if (contentItems) {
    module.contentItems = withStableItemIds(contentItems, module.contentItems);
  }

  if (quiz) {
    const { questions, ...settings } = quiz;
    Object.assign(module.quiz, settings);
    if (questions) module.quiz.questions = withStableQuestionIds(questions, module.quiz.questions);
  }

  try {
    await module.save();
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(
        CONFLICT,
        `Module code ${module.code} is already in use by another module.`,
        AppErrorCode.DUPLICATE_RESOURCE,
        [{ field: 'code', issue: 'duplicate' }]
      );
    }
    throw error;
  }

  // Editing the quiz of a LIVE module is legal but consequential, so the admin
  // is told rather than stopped. It is safe for the results already recorded
  // because each quizAttempt snapshots `passMarkAtAttempt` and stores the
  // questionIds it answered - raising the pass mark today cannot retroactively
  // fail somebody who passed last week. What it does change is what the next
  // attempt is graded against, which is what this warning is about.
  const warnings = [];

  if (quiz && quiz.questions && module.status === MODULE_STATUS.PUBLISHED) {
    const attemptCount = await QuizAttempt.countDocuments({ moduleId: module._id });

    if (attemptCount > 0) {
      warnings.push(
        `${attemptCount} quiz attempt${attemptCount === 1 ? ' has' : 's have'} already been ` +
          'recorded against this module. Past results keep the pass mark they were graded ' +
          'against, but everyone who takes the quiz from now on sees the edited questions.'
      );
    }
  }

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.TRAINING_MODULE_UPDATED,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: module._id,
    metadata: {
      code: module.code,
      status: module.status,
      contentEdited: !!contentItems,
      quizEdited: !!quiz,
      changedFields: Object.keys(fields),
    },
    req,
  });

  return { module: toAdminView(module), warnings };
};

// Permanent deletion of a module and everything recorded against it.
//
// This is the one operation in M3 that destroys evidence, and it does so
// deliberately: the quiz attempts sat against the module go with it. Spec 7.18
// keeps compliance evidence indefinitely, so this exists for withdrawing
// something that should never have been published - a test, a mistake - not for
// retiring a module people have completed. Archiving is the way to take a live
// module out of circulation while keeping the record.
//
// Two things make it defensible, both taken from the policy equivalent: the
// append-only audit entry survives the deletion and records how much evidence
// went with it, and the caller has to confirm that loss explicitly, which turns
// "delete this" into a decision that cannot be made by accident from a stale
// screen.
const destroy = async (moduleId, { acknowledgeEvidenceLoss } = {}, actor, req) => {
  const module = await loadModule(moduleId);

  const attemptCount = await QuizAttempt.countDocuments({ moduleId: module._id });

  AppAssert(
    attemptCount === 0 || acknowledgeEvidenceLoss === true,
    CONFLICT,
    `This module holds ${attemptCount} quiz attempt${attemptCount === 1 ? '' : 's'} — the record of who sat it and what they scored. Deleting destroys that permanently and cannot be undone. To delete anyway, confirm the evidence loss explicitly.`,
    AppErrorCode.VALIDATION_ERROR,
    [{ field: 'acknowledgeEvidenceLoss', issue: `${attemptCount} attempts would be destroyed` }]
  );

  // Written BEFORE the deletion, so the record of it exists even if what
  // follows fails halfway through.
  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.TRAINING_MODULE_DELETED,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: module._id,
    metadata: {
      code: module.code,
      title: module.title,
      status: module.status,
      contentItemCount: module.contentItems.length,
      questionCount: module.quiz.questions.length,
      attemptsDestroyed: attemptCount,
    },
    req,
  });

  // Ledger rows pointing at a module that no longer exists would surface on
  // every dashboard as an unresolvable task. Through the service, as ever.
  await assignmentService.removeForItems({
    itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
    itemIds: [module._id],
  });

  // The model refuses to delete a graded attempt by design, so this goes
  // through the driver - that bypass being exactly why the guard above exists.
  await mongoose.connection.collection('quizattempts').deleteMany({ moduleId: module._id });

  await TrainingModule.deleteOne({ _id: module._id });

  return { deleted: true, code: module.code, attemptsDestroyed: attemptCount };
};

// --- Reads ------------------------------------------------------------------

// Admins see every module, drafts included. Everyone else sees only PUBLISHED
// modules aimed at them - decided here, in the API, because hiding a row in
// React proves nothing (NFR-SEC-03).
const listModules = async (user) => {
  if (isAdmin(user)) {
    const modules = await TrainingModule.find().sort({ code: 1 });
    return modules.map((module) => toModuleSummary(module, { includeAudience: true }));
  }

  const modules = await TrainingModule.find({
    status: MODULE_STATUS.PUBLISHED,
    ...buildAudienceFilter(user),
  }).sort({ code: 1 });

  if (modules.length === 0) return [];

  // One ledger query for the whole list rather than one per row.
  const assignments = await assignmentService.findByUser(user._id, {
    itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
    itemIds: modules.map((module) => module._id),
  });
  const assignmentByItem = new Map(assignments.map((a) => [a.itemId.toString(), a]));

  const rows = await Promise.all(
    modules.map(async (module) => ({
      ...toModuleSummary(module),
      task: toTaskState(
        module,
        assignmentByItem.get(module._id.toString()) || null,
        await attemptService.quizState(user._id, module)
      ),
    }))
  );

  // Unfinished first, then by due date. Somebody with three modules outstanding
  // should not have to hunt for the one that is already late (US-026).
  return rows.sort((a, b) => {
    const rank = (row) => (row.task.completedAt ? 2 : row.task.status === 'OVERDUE' ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.task.dueDate && b.task.dueDate) return new Date(a.task.dueDate) - new Date(b.task.dueDate);
    return a.code.localeCompare(b.code);
  });
};

// Refused reads are audited, not merely refused: a burst of them from one
// account is what probing for material you should not see looks like
// (NFR-SEC-06). Mirrors version.service.getVersion.
const denyLearnerView = async (module, user, reason, req) => {
  await audit.recordForUser(user, {
    action: AUDIT_ACTIONS.RBAC_SCOPE_VIEW_DENIED,
    outcome: AUDIT_OUTCOME.DENIED,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: module._id,
    metadata: {
      reason,
      code: module.code,
      userRole: user.role,
      userDepartment: user.department,
      targetRoles: module.targetRoles,
      targetDepartments: module.targetDepartments,
    },
    req,
  });

  return new AppError(
    FORBIDDEN,
    'This training module is not assigned to your role or department.',
    AppErrorCode.SCOPE_VIOLATION
  );
};

// The gate on every employee-facing path in this module: reading it, marking
// progress, and starting a quiz all pass through here first. 403, deliberately,
// not a 404 that pretends the module does not exist (NFR-SEC-03).
const assertLearnerAccess = async (module, user, req) => {
  if (module.status !== MODULE_STATUS.PUBLISHED) {
    throw await denyLearnerView(module, user, 'NOT_PUBLISHED', req);
  }
  if (!matchesAudience(module, user)) {
    throw await denyLearnerView(module, user, 'OUTSIDE_AUDIENCE', req);
  }
};

// This learner's own state for one module: where they are in the content, and
// where they are with the quiz. Derived from the assignments ledger through
// M4's service rather than from the training collections, so the employee's
// screen and the manager's dashboard can never disagree.
const toTaskState = (module, assignment, quiz) => {
  const totalItems = module.contentItems.length;
  const completedItemIds = assignment?.progress?.completedItemIds || [];
  // Counted against the items that still EXIST: an admin removing an item must
  // not leave somebody stuck at 5 of 4, nor jump them to complete.
  const liveIds = new Set(module.contentItems.map((item) => item.itemId));
  const completed = completedItemIds.filter((itemId) => liveIds.has(itemId));

  const percentComplete =
    totalItems === 0 ? 0 : Math.min(100, Math.round((completed.length / totalItems) * 100));

  return {
    assigned: !!assignment,
    status: assignment ? assignment.status : 'NOT_ASSIGNED',
    dueDate: assignment ? assignment.dueDate : null,
    completedAt: assignment ? assignment.completedAt : null,
    completedItemIds: completed,
    itemsCompleted: completed.length,
    itemsTotal: totalItems,
    percentComplete,
    // The quiz opens only when the content is finished (UC-15 step 6). The API
    // refuses an early attempt whatever this says; it is here so the screen can
    // explain the lock rather than present a button that fails.
    quizUnlocked: totalItems > 0 && completed.length >= totalItems,
    itemsRemaining: Math.max(0, totalItems - completed.length),
    quiz,
  };
};

const findAssignment = async (userId, moduleId) => {
  const [assignment] = await assignmentService.findByUser(userId, {
    itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
    itemIds: [moduleId],
  });

  return assignment || null;
};

// One module. The ONE place `toAdminView` reaches a response body outside the
// ADMIN-guarded authoring routes - and only for an admin. Every other reader,
// whatever their role, gets `toLearnerView`, so no employee-facing path can
// return the answer key even by mistake (AD-3).
const getModule = async (moduleId, user, req) => {
  const module = await loadModule(moduleId);

  if (isAdmin(user)) return { module: toAdminView(module) };

  await assertLearnerAccess(module, user, req);

  const assignment = await findAssignment(user._id, module._id);
  const quiz = await attemptService.quizState(user._id, module);

  return { module: toLearnerView(module), task: toTaskState(module, assignment, quiz) };
};

// --- T4: working through the content ---------------------------------------

// Marking one item complete. The itemId is checked against the module rather
// than trusted, so a client cannot reach 100% by posting four ids of its own
// invention and unlocking the quiz early.
const markItemComplete = async (moduleId, itemId, user, req) => {
  const module = await loadModule(moduleId);
  await assertLearnerAccess(module, user, req);

  const item = module.contentItems.find((entry) => entry.itemId === itemId);

  AppAssert(
    item,
    NOT_FOUND,
    'That content item is not part of this module.',
    AppErrorCode.NOT_FOUND,
    [{ field: 'itemId', issue: 'unknown' }]
  );

  // Through the assignment service: the ledger belongs to M4 (NFR-MNT-01).
  // Idempotent there, so a double tap adds one entry, not two.
  await assignmentService.updateProgress({
    userId: user._id,
    moduleId: module._id,
    completedItemId: itemId,
    totalItems: module.contentItems.length,
  });

  const assignment = await findAssignment(user._id, module._id);
  const quiz = await attemptService.quizState(user._id, module);

  return { task: toTaskState(module, assignment, quiz) };
};

// --- T5 / T6: the attempt routes -------------------------------------------
//
// Thin: each one resolves the module and the assignment, then hands over to
// attempt.service, which owns every rule about grading, timing and limits.

const startAttempt = async (moduleId, user, req) => {
  const module = await loadModule(moduleId);
  await assertLearnerAccess(module, user, req);

  const assignment = await findAssignment(user._id, module._id);

  AppAssert(
    assignment,
    FORBIDDEN,
    'This training module has not been assigned to you.',
    AppErrorCode.SCOPE_VIOLATION
  );

  return attemptService.startAttempt(module, assignment, user, req);
};

const saveAttempt = async (attemptId, responses, user, req) => {
  const attempt = await attemptService.loadOwnedAttempt(attemptId, user);
  const module = await loadModule(attempt.moduleId);

  return { attempt: await attemptService.saveAnswers(module, attempt, responses, user, req) };
};

const submitAttempt = async (attemptId, user, req) => {
  const attempt = await attemptService.loadOwnedAttempt(attemptId, user);
  const module = await loadModule(attempt.moduleId);

  return attemptService.submitAttempt(module, attempt, user, req);
};

const getAttempt = async (attemptId, user, req) => {
  const attempt = await QuizAttempt.findById(attemptId);

  AppAssert(attempt, NOT_FOUND, 'Quiz attempt not found.', AppErrorCode.NOT_FOUND);

  const module = await loadModule(attempt.moduleId);

  return attemptService.getAttempt(module, attempt, user, req);
};

// Admin only, and not in the section 8.4 table: UC-17 and US-024 require a way
// back for somebody who has used every attempt, and there is no other route
// that could grant it.
const resetAttempts = async (moduleId, userId, actor, req) => {
  const module = await loadModule(moduleId);

  const targetUser = await User.findById(userId);
  AppAssert(targetUser, NOT_FOUND, 'User not found.', AppErrorCode.NOT_FOUND);

  return attemptService.resetAttempts(module, targetUser, actor, req);
};

// --- Who has completed this module ------------------------------------------
//
// The training counterpart of the acknowledgement trail (UC-12). Same shape and
// same principle: BOTH halves of the question - who finished and who has not -
// come back in one response, so the summary line can never disagree with the
// tables under it.
//
// Completion here is a passing quiz attempt, not a click, so each row carries
// the score it was earned with. There is no question or option anywhere in this
// payload: an admin looking at who passed has no need of the answer key, and
// leaving it out means one less route AD-3 has to hold on (AD-3).
const listCompletions = async (moduleId, actor, req) => {
  const module = await loadModule(moduleId);

  const assignments = await assignmentService.findByItem({
    itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
    itemId: module._id,
    withUser: true,
  });

  // One query for every attempt on this module, rather than one per person.
  const attempts = await QuizAttempt.find({
    moduleId: module._id,
    status: { $in: TERMINAL_ATTEMPT_STATUSES },
  }).sort({ scorePercent: -1 });

  // The BEST attempt per user, because that is what counts for compliance
  // (US-024) - the descending sort above makes the first one seen the best.
  const bestByUser = new Map();
  const attemptCounts = new Map();

  attempts.forEach((attempt) => {
    const key = attempt.userId.toString();
    if (!bestByUser.has(key)) bestByUser.set(key, attempt);
    attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);
  });

  const now = Date.now();
  const completed = [];
  const outstanding = [];

  assignments.forEach((assignment) => {
    const userId = assignment.userId ? assignment.userId._id.toString() : null;
    const best = userId ? bestByUser.get(userId) : null;

    const row = {
      userId,
      fullName: assignment.userId ? assignment.userId.fullName : '(account removed)',
      employeeId: assignment.userId ? assignment.userId.employeeId : null,
      department: assignment.department,
      attemptsUsed: userId ? attemptCounts.get(userId) || 0 : 0,
      attemptsAllowed: module.quiz.maxAttempts,
    };

    if (assignment.status === ASSIGNMENT_STATUS.COMPLETED) {
      completed.push({
        ...row,
        completedAt: assignment.completedAt,
        scorePercent: best ? best.scorePercent : null,
        attemptNumber: best ? best.attemptNumber : null,
      });
      return;
    }

    outstanding.push({
      ...row,
      dueDate: assignment.dueDate,
      percentComplete: assignment.progress?.percentComplete || 0,
      // The state that matters to whoever is chasing it: not started, part-way
      // through the content, at the quiz, or out of attempts.
      stage:
        (attemptCounts.get(userId) || 0) >= module.quiz.maxAttempts
          ? 'ATTEMPTS_EXHAUSTED'
          : (assignment.progress?.percentComplete || 0) >= 100
            ? 'QUIZ_OUTSTANDING'
            : (assignment.progress?.percentComplete || 0) > 0
              ? 'IN_PROGRESS'
              : 'NOT_STARTED',
      bestScorePercent: best ? best.scorePercent : null,
      isOverdue:
        assignment.status === ASSIGNMENT_STATUS.OVERDUE ||
        (assignment.dueDate && new Date(assignment.dueDate).getTime() < now),
    });
  });

  // Reading somebody's compliance record is itself an act worth recording.
  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.COMPLIANCE_AUDIT_VIEWED,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: module._id,
    metadata: {
      code: module.code,
      completedCount: completed.length,
      outstandingCount: outstanding.length,
    },
    req,
  });

  const assigned = completed.length + outstanding.length;

  return {
    module: {
      id: module._id.toString(),
      code: module.code,
      title: module.title,
      status: module.status,
      passMark: module.quiz.passMark,
      publishedAt: module.publishedAt,
    },
    summary: {
      completed: completed.length,
      outstanding: outstanding.length,
      assigned,
      percentComplete: assigned ? Math.round((completed.length / assigned) * 100) : 0,
    },
    completed: completed.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)),
    outstanding: outstanding.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
  };
};

// --- T3: publish and fan out ------------------------------------------------
//
// Structurally the M2-T4 publish sequence, minus one step: there is NO
// supersession here. Training modules are not versioned - they are edited in
// place - so there is no previous edition to close, and nobody's assignment is
// invalidated by a publication.

const contentItemIsEmpty = (item) =>
  (MARKDOWN_CONTENT_TYPES.includes(item.type) && !(item.body || '').trim()) ||
  (MEDIA_CONTENT_TYPES.includes(item.type) && !(item.mediaUrl || '').trim());

const publishModule = async (moduleId, actor, req) => {
  // Everything that can be refused is refused BEFORE any write, so a rejected
  // publication leaves the module exactly as it was.
  const module = await loadModule(moduleId);

  AppAssert(
    module.status !== MODULE_STATUS.ARCHIVED,
    CONFLICT,
    'This module is archived and cannot be published.',
    AppErrorCode.DUPLICATE_RESOURCE
  );

  AppAssert(
    module.contentItems.length > 0,
    BAD_REQUEST,
    'This module has no content. Add at least one content item before publishing it.',
    AppErrorCode.VALIDATION_ERROR,
    [{ field: 'contentItems', issue: 'empty' }]
  );

  // Items may be sketched empty while drafting; by publication each one has to
  // hold what its type promises, or an employee is asked to read a blank page.
  const emptyItems = module.contentItems.filter(contentItemIsEmpty);

  AppAssert(
    emptyItems.length === 0,
    BAD_REQUEST,
    `${emptyItems.length} content item${emptyItems.length === 1 ? ' has' : 's have'} nothing in them. Write the text, or give the video or PDF a link, before publishing.`,
    AppErrorCode.VALIDATION_ERROR,
    emptyItems.map((item) => ({ field: `contentItems.${item.title}`, issue: 'no content' }))
  );

  // A module with no assessment cannot be published: passing the quiz is the
  // completion evidence, so without questions there is no way to finish it.
  AppAssert(
    module.quiz.questions.length > 0,
    BAD_REQUEST,
    'This module has no quiz questions. A module without an assessment cannot be completed, so it cannot be published.',
    AppErrorCode.VALIDATION_ERROR,
    [{ field: 'quiz.questions', issue: 'empty' }]
  );

  const audience = { roles: module.targetRoles, departments: module.targetDepartments };

  // Publishing to nobody is a mistake, not an empty success. Checked here so
  // the module survives to be corrected, even though fanOut refuses too.
  const targetCount = await User.countDocuments(audienceUserFilter(audience));

  AppAssert(
    targetCount > 0,
    BAD_REQUEST,
    'No active user matches this audience, so publishing would assign the module to nobody. Widen the target roles or departments.',
    AppErrorCode.VALIDATION_ERROR
  );

  const publishedAt = new Date();
  const wasPublished = module.status === MODULE_STATUS.PUBLISHED;

  const outcome = await withTransaction(async (session) => {
    // Re-read inside the transaction: `withTransaction` may re-run this
    // callback after a transient conflict, and a document mutated outside it
    // would already be marked clean, so the retry would write nothing.
    const live = await TrainingModule.findById(moduleId).session(session);

    live.status = MODULE_STATUS.PUBLISHED;
    live.publishedBy = actor._id;
    // Republishing keeps the ORIGINAL publication instant. It is the date this
    // material was put in front of staff, and re-running the fan-out to pick up
    // new joiners does not change that.
    live.publishedAt = live.publishedAt || publishedAt;
    await live.save({ session });

    // Through the assignment service, never Assignment.updateMany() from here:
    // the ledger belongs to M4 (NFR-MNT-01). fanOut is an unordered upsert
    // keyed on { userId, itemType, itemId }, so a user who already holds an
    // assignment is skipped rather than duplicated or erroring - which is what
    // makes republishing to an overlapping audience safe. It also initialises
    // progress with an empty completedItemIds array and percentComplete 0.
    const fanOutResult = await assignmentService.fanOut({
      itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
      itemId: live._id,
      itemTitle: live.title,
      audience,
      dueInDays: live.dueInDays,
      source: ASSIGNMENT_SOURCE.PUBLICATION,
      session,
    });

    return { module: live, fanOutResult };
  });

  // TODO (T3, step 8 / US-021): notify every user in outcome.fanOutResult.userIds.
  // Left unwritten for the same reason M2-T4 left it: the notification payload
  // and whether dispatch is synchronous or queued are still open, and inventing
  // that contract here would commit the group to it.

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.TRAINING_PUBLISHED,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: outcome.module._id,
    metadata: {
      code: outcome.module.code,
      republished: wasPublished,
      targetCount,
      assignedCount: outcome.fanOutResult.assignedCount,
      alreadyAssignedCount: outcome.fanOutResult.skippedCount,
      questionCount: outcome.module.quiz.questions.length,
    },
    req,
  });

  return {
    // A summary rather than the full module: publishing is a state change, and
    // the answer key has no business travelling in its response.
    module: toModuleSummary(outcome.module, { includeAudience: true }),
    publication: {
      republished: wasPublished,
      targetCount,
      assignedCount: outcome.fanOutResult.assignedCount,
      alreadyAssignedCount: outcome.fanOutResult.skippedCount,
    },
  };
};

module.exports = {
  toAdminView,
  toLearnerView,
  toModuleSummary,
  createModule,
  updateModule,
  destroy,
  listModules,
  getModule,
  listCompletions,
  publishModule,
  markItemComplete,
  startAttempt,
  saveAttempt,
  submitAttempt,
  getAttempt,
  resetAttempts,
  isAdmin,
};
