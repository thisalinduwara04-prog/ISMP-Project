const { z } = require('zod');
const { ALL_DEPARTMENTS } = require('../../constants/roles');
const Assignment = require('../../models/Assignment');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier.');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const liveStatuses = Object.values(Assignment.ASSIGNMENT_STATUS)
  .filter((status) => status !== Assignment.ASSIGNMENT_STATUS.SUPERSEDED);

const filterFields = {
  department: z.enum(ALL_DEPARTMENTS).optional(),
  itemType: z.enum(Object.values(Assignment.ITEM_TYPE)).optional(),
  status: z.enum(liveStatuses).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
};

const filtersSchema = z.object(filterFields).strict().refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: 'The start date must not be after the end date.', path: ['from'] }
);

const outstandingQuerySchema = z.object({
  ...filterFields,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: 'The start date must not be after the end date.', path: ['from'] }
);

const reminderSchema = z.object({
  department: z.enum(ALL_DEPARTMENTS).optional(),
  userIds: z.array(objectId).max(100).default([]),
  assignmentIds: z.array(objectId).max(100).default([]),
}).strict().refine((value) => value.userIds.length > 0 || value.assignmentIds.length > 0, {
  message: 'Select at least one user or assignment.',
});

const exportSchema = z.object({
  ...filterFields,
  format: z.enum(['PDF', 'XLSX']),
}).strict().refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: 'The start date must not be after the end date.', path: ['from'] }
);

const userParamsSchema = z.object({ id: objectId }).strict();

module.exports = { filtersSchema, outstandingQuerySchema, reminderSchema, exportSchema, userParamsSchema };
