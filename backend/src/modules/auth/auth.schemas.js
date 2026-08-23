const { z } = require('zod');

// Zod at the route boundary, per NFR-SEC-04. Every object is `.strict()`, so a
// request carrying extra keys is rejected outright rather than having them
// quietly dropped - that is what stops a mass-assignment attempt such as
// { employeeId, password, role: "ADMIN" } from ever reaching a service.

const employeeIdSchema = z
  .string()
  .trim()
  .min(1, 'Employee ID is required.')
  .max(32, 'Employee ID is too long.')
  .transform((v) => v.toUpperCase());

// Login deliberately does NOT apply the password policy. Enforcing complexity
// here would let an attacker discover the policy from the login form, and
// would break login for any account whose password predates a policy change.
// The only rule is "present and of sane length".
const loginPasswordSchema = z.string().min(1, 'Password is required.').max(200);

const loginSchema = z
  .object({
    employeeId: employeeIdSchema,
    password: loginPasswordSchema,
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.').max(200),
    newPassword: z.string().min(1, 'New password is required.').max(200),
  })
  .strict();

module.exports = { loginSchema, changePasswordSchema, employeeIdSchema };
