const TrainingModule = require('../models/TrainingModule');
const TrainingCompletion = require('../models/TrainingCompletion');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

function appliesToRole(module, role) {
  return !module.targetRoles.length || module.targetRoles.includes(role);
}

// GET /api/training
const listTraining = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const wantsAll = isAdmin && req.query.all === 'true';

  const filter = wantsAll ? {} : { isActive: true };
  const modules = await TrainingModule.find(filter).sort({ createdAt: -1 });
  const visible = wantsAll ? modules : modules.filter((m) => appliesToRole(m, req.user.role));

  const completions = await TrainingCompletion.find({
    user: req.user._id,
    trainingModule: { $in: visible.map((m) => m._id) },
  });
  const completionMap = new Map(completions.map((c) => [c.trainingModule.toString(), c]));

  const result = visible.map((m) => {
    const c = completionMap.get(m._id.toString());
    return {
      id: m._id,
      title: m.title,
      description: m.description,
      estimatedMinutes: m.estimatedMinutes,
      targetRoles: m.targetRoles,
      isActive: m.isActive,
      questionCount: m.quiz.length,
      completion: c
        ? { score: c.score, passed: c.passed, completedAt: c.completedAt, attempts: c.attempts }
        : null,
    };
  });

  res.json({ modules: result });
});

// GET /api/training/:id  (quiz answers stripped for non-admins - only the
// question text/options are sent, never `correctOptionIndex`)
const getTrainingModule = asyncHandler(async (req, res) => {
  const module = await TrainingModule.findById(req.params.id);
  if (!module) throw new AppError('Training module not found.', 404);

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && (!module.isActive || !appliesToRole(module, req.user.role))) {
    throw new AppError('Training module not found.', 404);
  }

  const completion = await TrainingCompletion.findOne({
    user: req.user._id,
    trainingModule: module._id,
  });

  const payload = module.toObject();
  if (!isAdmin) {
    payload.quiz = payload.quiz.map((q) => ({ questionText: q.questionText, options: q.options }));
  }

  res.json({ module: payload, completion });
});

// POST /api/training (admin)
const createTraining = asyncHandler(async (req, res) => {
  const module = await TrainingModule.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ module });
});

// PATCH /api/training/:id (admin)
const updateTraining = asyncHandler(async (req, res) => {
  const module = await TrainingModule.findById(req.params.id);
  if (!module) throw new AppError('Training module not found.', 404);
  Object.assign(module, req.body);
  await module.save();
  res.json({ module });
});

// DELETE /api/training/:id (admin) - soft delete via isActive flag.
const deactivateTraining = asyncHandler(async (req, res) => {
  const module = await TrainingModule.findById(req.params.id);
  if (!module) throw new AppError('Training module not found.', 404);
  module.isActive = false;
  await module.save();
  res.json({ module });
});

// POST /api/training/:id/submit  { answers: [optionIndex, ...] }
const submitQuiz = asyncHandler(async (req, res) => {
  const module = await TrainingModule.findById(req.params.id);
  if (!module) throw new AppError('Training module not found.', 404);
  if (!module.quiz.length) throw new AppError('This module has no quiz.', 400);

  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== module.quiz.length) {
    throw new AppError(`Expected ${module.quiz.length} answers.`, 400);
  }

  let correctAnswers = 0;
  module.quiz.forEach((q, idx) => {
    if (answers[idx] === q.correctOptionIndex) correctAnswers += 1;
  });
  const score = Math.round((correctAnswers / module.quiz.length) * 100);
  const passed = score >= module.passingScorePercent;

  const existing = await TrainingCompletion.findOne({ user: req.user._id, trainingModule: module._id });

  const completion = existing
    ? await TrainingCompletion.findByIdAndUpdate(
        existing._id,
        {
          score,
          totalQuestions: module.quiz.length,
          correctAnswers,
          passed,
          completedAt: new Date(),
          attempts: existing.attempts + 1,
        },
        { new: true }
      )
    : await TrainingCompletion.create({
        user: req.user._id,
        trainingModule: module._id,
        score,
        totalQuestions: module.quiz.length,
        correctAnswers,
        passed,
      });

  res.status(201).json({ completion, score, passed, correctAnswers, totalQuestions: module.quiz.length });
});

module.exports = {
  listTraining,
  getTrainingModule,
  createTraining,
  updateTraining,
  deactivateTraining,
  submitQuiz,
};
