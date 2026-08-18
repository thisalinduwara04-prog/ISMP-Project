const { z } = require('zod');
const { ALL_ROLES, POLICY_STATUS } = require('../config/constants');

const createPolicySchema = z.object({
  title: z.string().trim().min(3).max(150),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000).optional().default(''),
  targetRoles: z.array(z.enum(ALL_ROLES)).optional().default([]),
  content: z.string().trim().min(10, 'must be at least 10 characters'),
  status: z.enum(Object.values(POLICY_STATUS)).optional().default(POLICY_STATUS.DRAFT),
});

// Publishing a new version only requires the new content + optional notes;
// metadata (title/category/targetRoles) is updated via a separate PATCH.
const newVersionSchema = z.object({
  content: z.string().trim().min(10, 'must be at least 10 characters'),
  changeNotes: z.string().trim().max(500).optional().default(''),
});

const updatePolicyMetaSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  category: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  targetRoles: z.array(z.enum(ALL_ROLES)).optional(),
  status: z.enum(Object.values(POLICY_STATUS)).optional(),
});

module.exports = { createPolicySchema, newVersionSchema, updatePolicyMetaSchema };
