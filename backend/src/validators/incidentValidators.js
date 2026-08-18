const { z } = require('zod');
const { INCIDENT_TYPES, INCIDENT_STATUS, INCIDENT_SEVERITY } = require('../config/constants');

const createIncidentSchema = z.object({
  type: z.enum(Object.values(INCIDENT_TYPES)),
  description: z.string().trim().min(10, 'must be at least 10 characters').max(3000),
});

const updateIncidentStatusSchema = z.object({
  status: z.enum(Object.values(INCIDENT_STATUS)),
  note: z.string().trim().max(1000).optional().default(''),
  severity: z.enum(Object.values(INCIDENT_SEVERITY)).optional(),
  assignedTo: z.string().trim().optional(),
});

module.exports = { createIncidentSchema, updateIncidentStatusSchema };
