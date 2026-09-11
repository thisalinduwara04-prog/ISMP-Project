const { z } = require('zod');

const { ALL_POLICY_CATEGORIES, ALL_POLICY_STATUSES } = require('../../constants/policies');
const { ALL_ROLES, ALL_DEPARTMENTS } = require('../../constants/roles');

// Zod at the route boundary, per NFR-SEC-04. Every object is `.strict()`, so a
// request carrying an extra key is rejected outright rather than having it
// quietly dropped. That is what stops a mass-assignment attempt such as
// { title, body, status: "PUBLISHED" } from ever reaching a service - the only
// route that may set `status` on a version is the publish route, which takes
// no status field at all.

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id.');

// Validating ids as params turns a malformed id into a 400 with a field-level
// message, rather than a Mongoose CastError that the error handler can only
// report as a 404.
const policyParams = z.object({ id: objectId }).strict();
const versionParams = z.object({ id: objectId, vid: objectId }).strict();
const attachmentParams = z.object({ id: objectId, vid: objectId, aid: objectId }).strict();

// "POL-AUP-001". Uppercased here so the unique index sees one canonical form
// and "pol-aup-001" cannot become a second policy.
const policyCode = z
  .string()
  .trim()
  .min(3, 'A policy code is required.')
  .max(32, 'Policy code is too long.')
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9-]*$/.test(value), {
    message: 'Use letters, digits and hyphens only, e.g. POL-AUP-001.',
  });

const title = z.string().trim().min(3, 'A title is required.').max(200, 'Title is too long.');
const description = z.string().trim().max(500, 'Description is too long.');

// --- T2: the policy shell ---

const createPolicySchema = z
  .object({
    title,
    // Optional: the service generates one from the category and a sequence
    // (POL-DAT-003) when it is omitted, which is the normal path. Still
    // accepted so an existing paper policy can keep the code it already has.
    code: policyCode.optional(),
    category: z.enum(ALL_POLICY_CATEGORIES),
    description: description.optional(),
    // Optional: an admin creating a policy is the accountable owner unless
    // they name someone else, which is the common case and saves the client
    // having to look up its own id.
    ownerId: objectId.optional(),
  })
  .strict();

const updatePolicySchema = z
  .object({
    title: title.optional(),
    category: z.enum(ALL_POLICY_CATEGORIES).optional(),
    description: description.optional(),
    ownerId: objectId.optional(),
    status: z.enum(ALL_POLICY_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

const listPoliciesQuery = z
  .object({
    category: z.enum(ALL_POLICY_CATEGORIES).optional(),
    // Admin-only affordance; ignored for everyone else, who never see archived
    // policies at all.
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

// --- T3: draft version authoring ---

// `versionNumber`, `status`, `authoredBy`, `publishedBy` and `publishedAt` are
// deliberately absent. They are all derived server-side; accepting any of them
// would let a client mint a published version by hand.
const createVersionSchema = z
  .object({
    title: title.optional(), // defaults to the parent policy's title
    // Optional while drafting: an admin may attach the signed PDF first, or
    // publish a policy whose whole text is the attachment. The publish route
    // is what insists a version has something readable in it.
    body: z.string().trim().max(100000).optional(),
    // Required from v2 onward. The version number is not known until the
    // service has looked at the existing versions, so that conditional rule
    // lives in the service rather than here.
    changeNote: z.string().trim().max(1000).optional(),
    targetRoles: z.array(z.enum(ALL_ROLES)).max(ALL_ROLES.length).optional(),
    targetDepartments: z.array(z.enum(ALL_DEPARTMENTS)).max(ALL_DEPARTMENTS.length).optional(),
    dueInDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();

const updateVersionSchema = createVersionSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

// --- T4: publish ---

const publishVersionSchema = z
  .object({
    // Defaults to the publication instant. Accepted so an admin can record a
    // policy that formally takes effect on a stated date.
    effectiveFrom: z.coerce.date().optional(),
  })
  .strict();

// --- T6: acknowledge ---

// Deliberately empty. The client has nothing to tell us that we are willing to
// believe: the timestamp, the time spent reading, the IP and the user agent
// are all derived server-side, precisely because they are evidence. `.strict()`
// means a client that tries to post `timeSpentSeconds: 900` gets a 400 rather
// than having it quietly ignored.
const acknowledgeSchema = z.object({}).strict();

// Deleting a policy destroys the acknowledgements recorded against every one
// of its versions. The flag has to be sent deliberately; the service refuses
// without it whenever there is evidence to lose.
const deletePolicySchema = z
  .object({ acknowledgeEvidenceLoss: z.boolean().optional() })
  .strict();

// --- T8: audit trail ---
//
// Paginated because a version accumulates one row per member of staff, every
// time it is republished, for as long as the business exists.
const acknowledgementsQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

module.exports = {
  policyParams,
  versionParams,
  attachmentParams,
  acknowledgeSchema,
  acknowledgementsQuery,
  deletePolicySchema,
  createPolicySchema,
  updatePolicySchema,
  listPoliciesQuery,
  createVersionSchema,
  updateVersionSchema,
  publishVersionSchema,
};
