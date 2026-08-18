const { z } = require('zod');
const { ALL_ROLES } = require('../config/constants');

const quizQuestionSchema = z.object({
  questionText: z.string().trim().min(3),
  options: z.array(z.string().trim().min(1)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
});

const trainingBaseSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(1000).optional().default(''),
  content: z.string().trim().min(10),
  mediaUrl: z.string().trim().url().optional().or(z.literal('')).default(''),
  estimatedMinutes: z.number().int().min(1).max(180).optional().default(5),
  targetRoles: z.array(z.enum(ALL_ROLES)).optional().default([]),
  quiz: z.array(quizQuestionSchema).min(1, 'add at least one quiz question'),
  passingScorePercent: z.number().int().min(0).max(100).optional().default(70),
  isActive: z.boolean().optional().default(true),
});

// .partial() only exists on ZodObject, so it must be derived from the base
// schema before .superRefine() wraps it in a ZodEffects.
const updateTrainingSchema = trainingBaseSchema.partial();

const createTrainingSchema = trainingBaseSchema.superRefine((val, ctx) => {
  val.quiz.forEach((q, idx) => {
    if (q.correctOptionIndex >= q.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `question ${idx + 1}: correctOptionIndex out of range`,
        path: ['quiz', idx, 'correctOptionIndex'],
      });
    }
  });
});

const quizSubmissionSchema = z.object({
  // answers[i] = selected option index for quiz question i
  answers: z.array(z.number().int().min(0)),
});

module.exports = { createTrainingSchema, updateTrainingSchema, quizSubmissionSchema };
