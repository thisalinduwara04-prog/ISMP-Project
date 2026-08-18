const mongoose = require('mongoose');
const { ALL_ROLES } = require('../config/constants');

const quizQuestionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true },
    options: {
      type: [String],
      required: true,
      validate: (arr) => arr.length >= 2 && arr.length <= 6,
    },
    correctOptionIndex: { type: Number, required: true },
  },
  { _id: false }
);

const trainingModuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Short article / walkthrough text. `mediaUrl` optionally points to an
    // external video/walkthrough resource shown alongside the content.
    content: { type: String, required: true },
    mediaUrl: { type: String, default: '' },
    estimatedMinutes: { type: Number, default: 5 },
    targetRoles: { type: [String], enum: ALL_ROLES, default: [] },
    quiz: { type: [quizQuestionSchema], default: [] },
    passingScorePercent: { type: Number, default: 70 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingModule', trainingModuleSchema);
