const { z } = require('zod');

const { ALL_ROLES, ALL_DEPARTMENTS, ALL_USER_STATUSES, ROLES } = require('../../constants/roles');

// Zod at the route boundary, per NFR-SEC-04. Every object is `.strict()`, which
// is what stops a mass-assignment attempt: a create body carrying
// `{ ..., status: "ACTIVE", tokenVersion: 0 }` is rejected outright rather than
// having the extra keys quietly dropped. Nothing a client sends may decide
// whether an account is locked, how many sessions it has, or what its password
// hash is - those are all derived server-side.

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id.');

// Validating the id as a param turns a malformed id into a 400 with a
// field-level message, rather than a Mongoose CastError the error handler can
// only report as a 404.
const userParams = z.object({ id: objectId }).strict();

// "SVK-014". Uppercased here so the unique index sees one canonical form and
// "svk-014" cannot become a second account for the same person.
const employeeId = z
  .string()
  .trim()
  .min(3, 'An employee ID is required.')
  .max(20, 'Employee ID is too long.')
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9-]*$/.test(value), {
    message: 'Use letters, digits and hyphens only, e.g. SVK-014.',
  });

const fullName = z.string().trim().min(2, 'A full name is required.').max(120, 'Name is too long.');

// Lowercased for the same reason as the employee ID. The model applies the
// format check; this keeps the canonical form consistent before it gets there.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(200, 'Email address is too long.');

const jobTitle = z.string().trim().max(120, 'Job title is too long.');

// --- Create (UC-01) ---
//
// `passwordHash`, `mustChangePassword`, `status`, `tokenVersion`, `lockedUntil`
// and `createdBy` are all deliberately absent. An account is always created
// ACTIVE, always with a server-generated temporary password, and always with
// the change-on-first-login flag set - there is no legitimate reason for a
// client to ask for anything else.
const createUserSchema = z
  .object({
    employeeId,
    fullName,
    email,
    department: z.enum(ALL_DEPARTMENTS),
    // Defaults to the least privilege that lets someone use the system at all.
    role: z.enum(ALL_ROLES).default(ROLES.EMPLOYEE),
    jobTitle: jobTitle.optional(),
  })
  .strict();

// --- Update (UC-05) ---
//
// `status` IS accepted here, unlike on create: deactivating a leaver is the
// whole point of the endpoint (US-007). The rule that an admin may not
// deactivate themselves is a relationship between the caller and the target,
// so it lives in the service where both are known.
const updateUserSchema = z
  .object({
    fullName: fullName.optional(),
    email: email.optional(),
    jobTitle: jobTitle.optional(),
    role: z.enum(ALL_ROLES).optional(),
    department: z.enum(ALL_DEPARTMENTS).optional(),
    status: z.enum(ALL_USER_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

// --- List ---
//
// Paginated from the start. The business is ~30 people today, but a roster is
// exactly the screen that grows quietly and the pagination contract is cheaper
// to honour now than to retrofit into a client later.
const listUsersQuery = z
  .object({
    department: z.enum(ALL_DEPARTMENTS).optional(),
    role: z.enum(ALL_ROLES).optional(),
    status: z.enum(ALL_USER_STATUSES).optional(),
    // Free text over name, employee ID and email. Treated as a literal string
    // by the service, never as a pattern.
    q: z.string().trim().max(80, 'Search term is too long.').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

module.exports = {
  userParams,
  createUserSchema,
  updateUserSchema,
  listUsersQuery,
};
