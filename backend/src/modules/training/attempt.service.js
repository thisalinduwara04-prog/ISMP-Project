const QuizAttempt = require('../../models/QuizAttempt');
const AuditLog = require('../../models/AuditLog');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const audit = require('../audit/audit.service');
const assignmentService = require('../assignment/assignment.service');
const { BAD_REQUEST, NOT_FOUND, FORBIDDEN, CONFLICT } = require('../../constants/http');
const { ROLES } = require('../../constants/roles');
const { ASSIGNMENT_ITEM_TYPE } = require('../../constants/assignments');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { ATTEMPT_STATUS, TERMINAL_ATTEMPT_STATUSES } = require('../../constants/training');

// ---------------------------------------------------------------------------
// The quiz attempt lifecycle (T5) and retakes (T6). UC-16, UC-17.
// ---------------------------------------------------------------------------
//
// Everything that decides an outcome happens HERE, on the server:
//
//   - grading, against the key held in the module document;
//   - the pass/fail comparison, against the mark SNAPSHOTTED on the attempt;
//   - the clock, from `startedAt` rather than from anything the client sends;
//   - the attempt count, and therefore whether another retake is allowed.
//
// A client that lies about any of it changes nothing. The only thing an
// attempt accepts from the browser is which options were selected.
//
// AD-3 governs every response shape in this file. A learner is told whether
// each question was right or wrong - the field is called `mark`, never
// `isCorrect`, because that name must not appear anywhere in an employee-facing
// body - and is never told which option WOULD have been right. The one thing
// revealed at the end is `explanation`, and only once there is nothing left to
// protect: after a pass, or after the final permitted attempt.

const isAdmin = (user) => user.role === ROLES.ADMIN;

const attemptNotFound = () =>
  new AppError(NOT_FOUND, 'Quiz attempt not found.', AppErrorCode.NOT_FOUND);

// --- The clock --------------------------------------------------------------

// null when the quiz is untimed. Computed from the attempt's own startedAt, so
// closing the laptop, logging out and coming back changes nothing: the deadline
// was fixed the moment the attempt began.
const deadlineFor = (attempt, quiz) =>
  quiz.timeLimitMinutes
    ? new Date(attempt.startedAt.getTime() + quiz.timeLimitMinutes * 60 * 1000)
    : null;

const secondsRemaining = (attempt, quiz) => {
  const deadline = deadlineFor(attempt, quiz);
  if (!deadline) return null;
  return Math.max(0, Math.round((deadline.getTime() - Date.now()) / 1000));
};

const hasExpired = (attempt, quiz) => {
  const deadline = deadlineFor(attempt, quiz);
  return !!deadline && Date.now() >= deadline.getTime();
};

// --- Counting attempts ------------------------------------------------------

// An admin reset does not delete history (7.18): the attempts stay, and the
// count simply starts again from the moment of the reset. The audit entry IS
// that moment - it is append-only, it already records who authorised it, and
// using it here means no second source of truth to keep in step.
const lastResetAt = async (userId, moduleId) => {
  const entry = await AuditLog.findOne({
    action: AUDIT_ACTIONS.QUIZ_ATTEMPTS_RESET,
    entityId: moduleId,
    'metadata.userId': userId.toString(),
  }).sort({ timestamp: -1 });

  return entry ? entry.timestamp : null;
};

// Attempts that count against the limit: SUBMITTED and EXPIRED only. One
// abandoned in IN_PROGRESS does not - a browser closed mid-quiz is not an
// attempt used up (US-024).
const countedAttempts = async (userId, moduleId) => {
  const since = await lastResetAt(userId, moduleId);

  return QuizAttempt.find({
    userId,
    moduleId,
    status: { $in: TERMINAL_ATTEMPT_STATUSES },
    ...(since ? { startedAt: { $gt: since } } : {}),
  }).sort({ attemptNumber: 1 });
};

// Every attempt ever made, reset or not - the employee's training record shows
// the lot, with the best one marked (US-024).
const allAttempts = (userId, moduleId) =>
  QuizAttempt.find({ userId, moduleId }).sort({ attemptNumber: 1 });

// THE score for compliance. Not the latest attempt - the best one. Exported
// because every screen that reports a score has to agree on this, and the way
// they disagree is by each reading `findOne().sort({ submittedAt: -1 })`.
const bestAttempt = async (userId, moduleId) => {
  const attempts = await QuizAttempt.find({
    userId,
    moduleId,
    status: { $in: TERMINAL_ATTEMPT_STATUSES },
  });

  if (attempts.length === 0) return null;

  return attempts.reduce((best, attempt) =>
    (attempt.scorePercent || 0) > (best.scorePercent || 0) ? attempt : best
  );
};

// The same summary wherever a module is listed or opened, so the player, the
// list and the results screen can never disagree about how many goes are left.
const quizState = async (userId, module) => {
  const used = await countedAttempts(userId, module._id);
  const best = await bestAttempt(userId, module._id);
  const inProgress = await QuizAttempt.findOne({
    userId,
    moduleId: module._id,
    status: ATTEMPT_STATUS.IN_PROGRESS,
  }).sort({ attemptNumber: -1 });

  return {
    passMark: module.quiz.passMark,
    questionCount: module.quiz.questions.length,
    timeLimitMinutes: module.quiz.timeLimitMinutes,
    attemptsUsed: used.length,
    attemptsAllowed: module.quiz.maxAttempts,
    attemptsRemaining: Math.max(0, module.quiz.maxAttempts - used.length),
    passed: !!best && best.passed,
    bestScorePercent: best ? best.scorePercent : null,
    bestAttemptNumber: best ? best.attemptNumber : null,
    activeAttemptId: inProgress ? inProgress._id.toString() : null,
    attempts: (await allAttempts(userId, module._id))
      .filter((attempt) => TERMINAL_ATTEMPT_STATUSES.includes(attempt.status))
      .map((attempt) => ({
        id: attempt._id.toString(),
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        scorePercent: attempt.scorePercent,
        passed: attempt.passed,
        isBest: !!best && best._id.equals(attempt._id),
      })),
  };
};

// --- Response shaping -------------------------------------------------------

// The questions as they are being answered. No isCorrect on any option, no
// explanation on any question - this is the payload AD-3 is really about, and
// it is built by listing what goes out rather than by deleting what must not.
const toQuestionPaper = (module, attempt) => {
  const byId = new Map(module.quiz.questions.map((question) => [question.questionId, question]));

  return attempt.presentedQuestionIds
    .map((questionId) => byId.get(questionId))
    .filter(Boolean)
    .map((question, index) => {
      const response = attempt.responses.find((entry) => entry.questionId === question.questionId);

      return {
        questionId: question.questionId,
        // The position in THIS attempt's order, which is what the "question 3
        // is unanswered" message refers to when the quiz is shuffled.
        number: index + 1,
        text: question.text,
        type: question.type,
        options: question.options.map((option) => ({
          optionId: option.optionId,
          text: option.text,
        })),
        selectedOptionIds: response ? response.selectedOptionIds : [],
      };
    });
};

const toAttemptView = (module, attempt) => ({
  id: attempt._id.toString(),
  moduleId: module._id.toString(),
  moduleTitle: module.title,
  attemptNumber: attempt.attemptNumber,
  status: attempt.status,
  startedAt: attempt.startedAt,
  totalQuestions: attempt.totalQuestions,
  passMark: attempt.passMarkAtAttempt,
  timeLimitMinutes: module.quiz.timeLimitMinutes,
  deadline: deadlineFor(attempt, module.quiz),
  secondsRemaining: secondsRemaining(attempt, module.quiz),
  questions: toQuestionPaper(module, attempt),
});

// The graded result. `mark` says right or wrong; nothing says what the right
// answer was. The explanation is the single exception, and only once the
// learner has either passed or used their last attempt - at which point there
// is no longer an answer to protect, and an explanation is the only way the
// exercise teaches anything (US-023, US-024).
const toResultView = (module, attempt, state) => {
  const reveal = attempt.passed || state.attemptsRemaining === 0;
  const byId = new Map(module.quiz.questions.map((question) => [question.questionId, question]));

  return {
    id: attempt._id.toString(),
    moduleId: module._id.toString(),
    moduleTitle: module.title,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    scorePercent: attempt.scorePercent,
    correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions,
    // The mark this attempt was graded against, not whatever the module says
    // today. An admin raising the bar next month cannot retroactively fail it.
    passMark: attempt.passMarkAtAttempt,
    passed: attempt.passed,
    // True when the clock ran out and the server submitted it (UC-16, 5a).
    timedOut: attempt.status === ATTEMPT_STATUS.EXPIRED,
    attemptsUsed: state.attemptsUsed,
    attemptsAllowed: state.attemptsAllowed,
    attemptsRemaining: state.attemptsRemaining,
    bestScorePercent: state.bestScorePercent,
    bestAttemptNumber: state.bestAttemptNumber,
    explanationsRevealed: reveal,
    questions: attempt.presentedQuestionIds
      .map((questionId) => byId.get(questionId))
      .filter(Boolean)
      .map((question, index) => {
        const response = attempt.responses.find((e) => e.questionId === question.questionId);
        const selected = response ? response.selectedOptionIds : [];

        return {
          questionId: question.questionId,
          number: index + 1,
          text: question.text,
          // Only the options this person actually chose are named, and only as
          // their own answer. Nothing marks an option they did not choose, so
          // the right answer cannot be read off a wrong result (US-023).
          yourAnswer: question.options
            .filter((option) => selected.includes(option.optionId))
            .map((option) => option.text),
          mark: response && response.isCorrect ? 'CORRECT' : 'INCORRECT',
          ...(reveal && question.explanation ? { explanation: question.explanation } : {}),
        };
      }),
  };
};

// --- Grading ----------------------------------------------------------------

// Exact set match, which is what makes MULTI_CHOICE meaningful: selecting two
// of the three correct options is not two thirds right, it is wrong. The same
// rule grades SINGLE_CHOICE and TRUE_FALSE, because a one-element set matches
// exactly when the one element is the correct one.
const gradeQuestion = (question, selectedOptionIds = []) => {
  const correct = question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.optionId);

  const selected = [...new Set(selectedOptionIds)];

  return (
    correct.length === selected.length && correct.every((optionId) => selected.includes(optionId))
  );
};

// Grade, save, and close the assignment if it was a pass. Shared by the
// ordinary submit route and by the expiry path, because an attempt that ran out
// of time is graded exactly like one that was handed in - the only difference
// is that the unanswered questions score zero and nobody is asked to confirm.
const gradeAndClose = async (module, attempt, { expired = false } = {}, actor, req) => {
  const byId = new Map(module.quiz.questions.map((question) => [question.questionId, question]));

  const responses = attempt.presentedQuestionIds.map((questionId) => {
    const question = byId.get(questionId);
    const existing = attempt.responses.find((entry) => entry.questionId === questionId);
    const selectedOptionIds = existing ? existing.selectedOptionIds : [];

    return {
      questionId,
      selectedOptionIds,
      // A question that was never answered is wrong, not skipped.
      isCorrect: question ? gradeQuestion(question, selectedOptionIds) : false,
    };
  });

  const totalQuestions = responses.length;
  const correctCount = responses.filter((response) => response.isCorrect).length;
  const scorePercent = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  attempt.responses = responses;
  attempt.totalQuestions = totalQuestions;
  attempt.correctCount = correctCount;
  attempt.scorePercent = scorePercent;
  // Against the snapshot, never against module.quiz.passMark.
  attempt.passed = scorePercent >= attempt.passMarkAtAttempt;
  attempt.status = expired ? ATTEMPT_STATUS.EXPIRED : ATTEMPT_STATUS.SUBMITTED;
  attempt.submittedAt = new Date();

  await attempt.save();

  // A pass is what completes the module - not reaching the end of the content.
  // Through the assignment service, never Assignment.updateMany() from here
  // (NFR-MNT-01). The attempt id becomes the completionRef: the evidence, not
  // merely a flag saying evidence existed.
  if (attempt.passed) {
    await assignmentService.complete({
      userId: attempt.userId,
      itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
      itemId: module._id,
      completionRef: attempt._id,
      completedAt: attempt.submittedAt,
    });
  }

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.QUIZ_SUBMITTED,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: module._id,
    metadata: {
      attemptId: attempt._id.toString(),
      attemptNumber: attempt.attemptNumber,
      scorePercent,
      passMarkAtAttempt: attempt.passMarkAtAttempt,
      passed: attempt.passed,
      expired,
    },
    req,
  });

  return attempt;
};

// An IN_PROGRESS attempt whose deadline has passed is graded the moment
// anything touches it. Called on every path that loads one, so the expiry rule
// holds without a scheduled job: whatever the user does next - resume, save,
// submit, or simply reopen the module - finds the attempt already closed.
const closeIfExpired = async (module, attempt, actor, req) => {
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) return attempt;
  if (!hasExpired(attempt, module.quiz)) return attempt;

  return gradeAndClose(module, attempt, { expired: true }, actor, req);
};

// --- Commands ---------------------------------------------------------------

const shuffled = (values) => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Start an attempt, or resume the one already in progress.
 *
 * Resuming rather than starting a second is what makes the session-expiry path
 * work: a user whose session died mid-quiz logs back in, comes here, and gets
 * the same attempt back with the remaining time still counting down from the
 * server's clock (UC-16, 5a).
 */
const startAttempt = async (module, assignment, user, req) => {
  // The quiz unlocks only when the content is finished. Enforced here, in the
  // API - a locked button in React is a courtesy, not a control (NFR-SEC-03).
  const completed = assignment.progress?.completedItemIds?.length || 0;
  const remaining = module.contentItems.length - completed;

  AppAssert(
    remaining <= 0,
    FORBIDDEN,
    `Finish the module first — ${remaining} item${remaining === 1 ? '' : 's'} still to complete before the quiz unlocks.`,
    AppErrorCode.SCOPE_VIOLATION,
    [{ field: 'progress', issue: `${remaining} items remaining` }]
  );

  const existing = await QuizAttempt.findOne({
    userId: user._id,
    moduleId: module._id,
    status: ATTEMPT_STATUS.IN_PROGRESS,
  }).sort({ attemptNumber: -1 });

  if (existing) {
    const settled = await closeIfExpired(module, existing, user, req);
    // Still running: hand it back rather than opening a second one.
    if (settled.status === ATTEMPT_STATUS.IN_PROGRESS) {
      return { attempt: toAttemptView(module, settled), resumed: true };
    }
  }

  const used = await countedAttempts(user._id, module._id);
  const best = await bestAttempt(user._id, module._id);

  // Nothing to gain and a result to lose: the best score is what counts, so a
  // fourth go after passing could only leave the record looking worse.
  AppAssert(
    !best || !best.passed,
    CONFLICT,
    `You have already passed this module with ${best ? best.scorePercent : 0}%. There is nothing left to do.`,
    AppErrorCode.DUPLICATE_RESOURCE
  );

  // 403 with the route out, not a bare refusal. Only an admin can give the
  // attempts back, so the message says so (UC-17, 4a).
  AppAssert(
    used.length < module.quiz.maxAttempts,
    FORBIDDEN,
    `You have used all ${module.quiz.maxAttempts} attempts at this quiz. Contact your manager to have them reset.`,
    AppErrorCode.SCOPE_VIOLATION,
    [{ field: 'attempts', issue: 'exhausted' }]
  );

  const latest = await QuizAttempt.findOne({ userId: user._id, moduleId: module._id })
    .sort({ attemptNumber: -1 })
    .select('attemptNumber');

  const questionIds = module.quiz.questions.map((question) => question.questionId);

  const attempt = await QuizAttempt.create({
    userId: user._id,
    moduleId: module._id,
    attemptNumber: latest ? latest.attemptNumber + 1 : 1,
    status: ATTEMPT_STATUS.IN_PROGRESS,
    startedAt: new Date(),
    // Stored, so a shuffled paper can be graded and re-displayed in the order
    // this person actually saw - otherwise "question 3" means two things.
    presentedQuestionIds: module.quiz.shuffleQuestions ? shuffled(questionIds) : questionIds,
    totalQuestions: questionIds.length,
    // THE snapshot. Everything about not invalidating past results rests here.
    passMarkAtAttempt: module.quiz.passMark,
    assignmentId: assignment._id,
  });

  return { attempt: toAttemptView(module, attempt), resumed: false };
};

// Owner only. An admin may READ a result (below) but may not sit somebody
// else's quiz for them, so this check is not relaxed for them.
const loadOwnedAttempt = async (attemptId, user) => {
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw attemptNotFound();

  AppAssert(
    attempt.userId.equals(user._id),
    FORBIDDEN,
    'This quiz attempt belongs to somebody else.',
    AppErrorCode.SCOPE_VIOLATION
  );

  return attempt;
};

// Answers as they are chosen, so a phone that dies mid-quiz has not lost them.
// Never graded here: `isCorrect` stays null until submission, because a client
// that could ask "was that right?" per answer would have the key.
const saveAnswers = async (module, attempt, responses, user, req) => {
  const settled = await closeIfExpired(module, attempt, user, req);

  AppAssert(
    settled.status === ATTEMPT_STATUS.IN_PROGRESS,
    CONFLICT,
    settled.status === ATTEMPT_STATUS.EXPIRED
      ? 'Time ran out, so this attempt was submitted automatically.'
      : 'This attempt has already been submitted and cannot be changed.',
    AppErrorCode.DUPLICATE_RESOURCE,
    [{ field: 'attemptId', issue: settled.status }]
  );

  const known = new Set(attempt.presentedQuestionIds);
  const merged = new Map(
    attempt.responses.map((entry) => [entry.questionId, entry.selectedOptionIds])
  );

  responses
    .filter((response) => known.has(response.questionId))
    .forEach((response) => merged.set(response.questionId, response.selectedOptionIds));

  attempt.responses = [...merged.entries()].map(([questionId, selectedOptionIds]) => ({
    questionId,
    selectedOptionIds,
    isCorrect: null,
  }));

  await attempt.save();

  return toAttemptView(module, attempt);
};

const submitAttempt = async (module, attempt, user, req) => {
  const expired = hasExpired(attempt, module.quiz);

  AppAssert(
    attempt.status === ATTEMPT_STATUS.IN_PROGRESS,
    CONFLICT,
    'This attempt has already been submitted.',
    AppErrorCode.DUPLICATE_RESOURCE
  );

  // Unanswered questions are refused only while there is still time to go back
  // and answer them. Once the clock has run out the attempt is graded as it
  // stands, because there is nothing the learner can do about it now.
  if (!expired) {
    const answered = new Set(
      attempt.responses
        .filter((response) => response.selectedOptionIds.length > 0)
        .map((response) => response.questionId)
    );

    const unanswered = attempt.presentedQuestionIds
      .map((questionId, index) => ({ questionId, number: index + 1 }))
      .filter((entry) => !answered.has(entry.questionId));

    AppAssert(
      unanswered.length === 0,
      BAD_REQUEST,
      `Question${unanswered.length === 1 ? '' : 's'} ${unanswered
        .map((entry) => entry.number)
        .join(', ')} ${unanswered.length === 1 ? 'has' : 'have'} not been answered.`,
      AppErrorCode.VALIDATION_ERROR,
      unanswered.map((entry) => ({ field: `question.${entry.number}`, issue: 'unanswered' }))
    );
  }

  const graded = await gradeAndClose(module, attempt, { expired }, user, req);
  const state = await quizState(user._id, module);

  return { result: toResultView(module, graded, state), quiz: state };
};

// Owner or ADMIN. An admin reading a result is how "contact your manager for a
// reset" is answered, so they see the same body the learner does - including
// no answer key, because there is no reason for one to travel here either.
const getAttempt = async (module, attempt, user, req) => {
  AppAssert(
    attempt.userId.equals(user._id) || isAdmin(user),
    FORBIDDEN,
    'This quiz attempt belongs to somebody else.',
    AppErrorCode.SCOPE_VIOLATION
  );

  const settled = await closeIfExpired(module, attempt, user, req);
  const state = await quizState(settled.userId, module);

  // Still running: the paper, not a result.
  if (settled.status === ATTEMPT_STATUS.IN_PROGRESS) {
    return { attempt: toAttemptView(module, settled), quiz: state };
  }

  return { result: toResultView(module, settled, state), quiz: state };
};

/**
 * Give one person their attempts back at one module (UC-17, T6).
 *
 * Deletes nothing. The historical attempts stay exactly where they are - they
 * are compliance evidence, and the model refuses to remove them anyway - and
 * the audit entry written here becomes the point the count starts from.
 */
const resetAttempts = async (module, targetUser, actor, req) => {
  const before = await countedAttempts(targetUser._id, module._id);

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.QUIZ_ATTEMPTS_RESET,
    entityType: AUDIT_ENTITY_TYPE.TRAINING_MODULE,
    entityId: module._id,
    metadata: {
      // Read back by lastResetAt, which is why it is a string here: the
      // metadata is a free-form object and querying it wants one shape.
      userId: targetUser._id.toString(),
      userName: targetUser.fullName,
      moduleCode: module.code,
      attemptsCleared: before.length,
      note: 'Historical attempts retained; only the count against the limit was reset.',
    },
    req,
  });

  return {
    reset: true,
    attemptsCleared: before.length,
    attemptsAllowed: module.quiz.maxAttempts,
  };
};

module.exports = {
  startAttempt,
  saveAnswers,
  submitAttempt,
  getAttempt,
  resetAttempts,
  loadOwnedAttempt,
  closeIfExpired,
  bestAttempt,
  quizState,
  gradeQuestion,
  toAttemptView,
  toResultView,
};
