const { z } = require('zod');

const { AUDIT_OUTCOME } = require('../../constants/auditActions');

// Zod at the route boundary, per NFR-SEC-04. `.strict()` so an unrecognised
// query key is refused outright rather than silently ignored - on a read that
// filters evidence, quietly dropping `?sortBy=` would hand back a different
// answer from the one that was asked for.

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id.');

// Deliberately NOT `z.enum(Object.values(AUDIT_ACTIONS))`.
//
// M4 and M5 are built on their own branches against the same database, so the
// log genuinely contains actions this branch has never heard of -
// COMPLIANCE_DASHBOARD_VIEWED and INCIDENT_SUBMITTED among them. Validating
// against our own enum would answer a request to filter by one of those with a
// 400, while the entries sit in the collection. The shape is constrained
// instead: SCREAMING_SNAKE_CASE and nothing else, which is enough to keep a
// hand-written pattern out of the query.
const action = z
  .string()
  .trim()
  .max(64, 'Action name is too long.')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Must be an action name, e.g. POLICY_PUBLISHED.');

// This enum IS safe to pin. Unlike the action list, the three outcomes are the
// closed vocabulary of the model itself and have not moved since T0.
const outcome = z.enum(Object.values(AUDIT_OUTCOME));

const listAuditLogsQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    action: action.optional(),
    outcome: outcome.optional(),
    actorId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine((value) => !(value.from && value.to) || value.from <= value.to, {
    message: 'The start of the range must not be after the end.',
    path: ['from'],
  });

module.exports = { listAuditLogsQuery };
