const mongoose = require('mongoose');

const {
  ALL_ATTEMPT_STATUSES,
  ATTEMPT_STATUS,
  TERMINAL_ATTEMPT_STATUSES,
} = require('../constants/training');

// Spec section 7.9. The training counterpart of an acknowledgement: proof that
// a named person sat an assessment and what they scored. Two properties carry
// the weight here.
//
//   1. It is IMMUTABLE once graded. A finished attempt is compliance evidence,
//      so nothing in the system may edit or delete one - not a retake, not the
//      admin reset in M3-T6, which clears the count without touching history.
//   2. passMarkAtAttempt is a SNAPSHOT. An admin raising the module's pass mark
//      next month must not retroactively fail somebody who passed today.

const responseSchema = new mongoose.Schema(
  {
    // The question's stable nanoid, not its position, so an admin reordering
    // the quiz cannot repoint an answered response at a different question.
    questionId: { type: String, required: true },
    selectedOptionIds: { type: [String], default: [] },

    // Written by the server at grading time. Never accepted from the client -
    // it is a conclusion, not an input.
    isCorrect: { type: Boolean, default: null },
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingModule', required: true },

    attemptNumber: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      required: true,
      enum: ALL_ATTEMPT_STATUSES,
      default: ATTEMPT_STATUS.IN_PROGRESS,
    },

    // The server's clock, and the only thing a timed quiz's deadline is
    // computed from. A session expiring mid-attempt leaves the attempt
    // IN_PROGRESS and the remaining time keeps running from here.
    startedAt: { type: Date, required: true, default: Date.now },
    submittedAt: { type: Date, default: null },

    // The order questions were presented in when shuffleQuestions is on, so a
    // saved answer maps back to the right question on resume.
    presentedQuestionIds: { type: [String], default: [] },

    responses: { type: [responseSchema], default: [] },

    totalQuestions: { type: Number, default: 0, min: 0 },
    correctCount: { type: Number, default: 0, min: 0 },
    scorePercent: { type: Number, default: null, min: 0, max: 100 },

    // Snapshotted from module.quiz.passMark when the attempt starts. Grading
    // compares against THIS, never against the module's current value.
    passMarkAtAttempt: { type: Number, required: true, min: 1, max: 100 },

    passed: { type: Boolean, default: false },

    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// --- Indexes (spec section 7.16) ---

// Serves both "how many attempts has this user used?" and the descending scan
// that finds the latest attempt number to increment from.
quizAttemptSchema.index({ userId: 1, moduleId: 1, attemptNumber: -1 });

// --- Immutability after grading (spec section 7.9 rules) ---

// Remember the status the document had when it was loaded. `isModified` alone
// cannot answer "was this already finished before this save?", because the
// submit transition itself modifies `status` in the same save.
quizAttemptSchema.post('init', function rememberStatus() {
  this.$locals.loadedStatus = this.status;
});

quizAttemptSchema.pre('save', function freezeOnceGraded(next) {
  if (this.isNew) return next();
  if (!TERMINAL_ATTEMPT_STATUSES.includes(this.$locals.loadedStatus)) return next();

  return next(
    new Error(
      `A ${this.$locals.loadedStatus} quiz attempt is immutable and cannot be changed. ` +
        'Start a new attempt instead.'
    )
  );
});

// Query-level writes bypass document middleware entirely, so the same rule has
// to be restated for them. The hook cannot read a status off the filter, so it
// asks the database whether the filter touches anything already graded - one
// indexed count, on a path that only runs while an attempt is in progress.
const blockGradedMutation = async function blockGradedMutation(next) {
  const graded = await this.model.countDocuments({
    ...this.getFilter(),
    status: { $in: TERMINAL_ATTEMPT_STATUSES },
  });

  if (graded > 0) {
    return next(
      new Error(
        'A submitted or expired quiz attempt is immutable: it cannot be updated or deleted. ' +
          'Resetting a user\'s attempts clears the count without removing the history.'
      )
    );
  }

  return next();
};

quizAttemptSchema.pre('updateOne', blockGradedMutation);
quizAttemptSchema.pre('updateMany', blockGradedMutation);
quizAttemptSchema.pre('findOneAndUpdate', blockGradedMutation);
quizAttemptSchema.pre('findOneAndReplace', blockGradedMutation);
quizAttemptSchema.pre('replaceOne', blockGradedMutation);
quizAttemptSchema.pre('deleteOne', blockGradedMutation);
quizAttemptSchema.pre('deleteMany', blockGradedMutation);
quizAttemptSchema.pre('findOneAndDelete', blockGradedMutation);

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
