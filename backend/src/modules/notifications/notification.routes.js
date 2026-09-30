const express = require('express');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const controller = require('./notification.controller');
const { paramsSchema } = require('./notification.schemas');

const router = express.Router();
// A temporary password must be changed before anything else (US-003).
router.use(authenticate, requirePasswordChanged);
router.get('/', asyncHandler(controller.list));
router.patch('/:id/read', validate(paramsSchema, 'params'), asyncHandler(controller.read));
router.post('/read-all', asyncHandler(controller.readAll));

module.exports = router;
