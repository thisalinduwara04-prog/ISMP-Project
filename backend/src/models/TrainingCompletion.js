const mongoose = require('mongoose');

// One record per (user, trainingModule) capturing their latest quiz result.
// Re-attempts overwrite score/passed/completedAt so the dashboard always
// reflects the most recent attempt.
const trainingCompletionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    trainingModule: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingModule', required: true },
    score: { type: Number, required: true }, // percentage 0-100
    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    attempts: { type: Number, default: 1 },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

trainingCompletionSchema.index({ user: 1, trainingModule: 1 }, { unique: true });

module.exports = mongoose.model('TrainingCompletion', trainingCompletionSchema);
