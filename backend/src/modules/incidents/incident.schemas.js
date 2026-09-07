const { z } = require('zod');

const {
  ALL_INCIDENT_TYPES,
  ALL_INCIDENT_SEVERITIES,
  ALL_INCIDENT_STATUSES,
} = require('../../constants/incidents');

// Zod at the route boundary, per NFR-SEC-04. Every object is `.strict()`.
//
// Note this module's requests arrive as multipart/form-data, so every field is
// a STRING on the way in - `occurredAt` is coerced, and an empty optional text
// field arrives as "" rather than undefined, which is why the optional string
// fields normalise "" to undefined before validating.

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid identifier.');

const objectIdParamSchema = z
  .object({
    id: objectId,
    fid: objectId.optional(),
  })
  .strict();

// An empty multipart field is not an answer, it is an unfilled box.
const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

const createIncidentSchema = z
  .object({
    type: z.enum(ALL_INCIDENT_TYPES, {
      errorMap: () => ({ message: 'Choose one of the listed incident types.' }),
    }),
    title: z
      .string()
      .trim()
      .min(3, 'Give the report a short title of at least 3 characters.')
      .max(140, 'Keep the title under 140 characters.'),
    description: z
      .string()
      .trim()
      .min(10, 'Describe what happened in at least 10 characters.')
      .max(4000, 'Keep the description under 4000 characters.'),
    occurredAt: z.preprocess(
      emptyToUndefined,
      z.coerce
        .date({ invalid_type_error: 'Enter a valid date and time.' })
        .max(new Date(), 'The incident cannot have happened in the future.')
        .optional()
    ),
  })
  // `severity` is absent on purpose (US-037). Combined with .strict(), a client
  // that tries to set its own severity gets a 400 rather than relying on the
  // service remembering to ignore the field.
  .strict();

const listIncidentsSchema = z
  .object({
    status: z.preprocess(emptyToUndefined, z.enum(ALL_INCIDENT_STATUSES).optional()),
    type: z.preprocess(emptyToUndefined, z.enum(ALL_INCIDENT_TYPES).optional()),
    severity: z.preprocess(emptyToUndefined, z.enum(ALL_INCIDENT_SEVERITIES).optional()),
    q: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(140, 'Keep the search term under 140 characters.').optional()
    ),
  })
  .strict();

const updateIncidentSchema = z
  .object({
    status: z.enum(ALL_INCIDENT_STATUSES).optional(),
    severity: z.enum(ALL_INCIDENT_SEVERITIES).optional(),
    // Explicit null unassigns; omitting the key leaves the owner unchanged.
    assignedTo: objectId.nullable().optional(),
    note: z.string().trim().max(1000, 'Keep the note under 1000 characters.').optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one change.',
  });

module.exports = {
  objectIdParamSchema,
  createIncidentSchema,
  listIncidentsSchema,
  updateIncidentSchema,
};
