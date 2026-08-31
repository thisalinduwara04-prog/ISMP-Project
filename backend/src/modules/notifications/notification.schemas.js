const { z } = require('zod');

const paramsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid notification identifier.'),
}).strict();

module.exports = { paramsSchema };
