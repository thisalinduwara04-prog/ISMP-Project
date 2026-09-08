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

module.exports = { toAdminView, toLearnerView };
