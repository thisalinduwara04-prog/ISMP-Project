const { z } = require('zod');
const { ALL_ROLES } = require('../config/constants');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'must be at least 2 characters').max(100),
  employeeId: z.string().trim().min(2).max(30),
  email: z.string().trim().email('must be a valid email address'),
  department: z.enum(ALL_ROLES, { errorMap: () => ({ message: 'must be a valid department/role' }) }),
  // Self-registration cannot grant admin; only seeded/promoted accounts are admins.
  password: z
    .string()
    .min(8, 'must be at least 8 characters')
    .regex(/[A-Z]/, 'must contain an uppercase letter')
    .regex(/[0-9]/, 'must contain a number'),
});

const loginSchema = z.object({
  employeeId: z.string().trim().min(1, 'is required'),
  password: z.string().min(1, 'is required'),
});

module.exports = { registerSchema, loginSchema };
