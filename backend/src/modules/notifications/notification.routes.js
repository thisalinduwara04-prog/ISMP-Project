const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const controller = require('./notification.controller');
const { paramsSchema } = require('./notification.schemas');

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(controller.list));
router.patch('/:id/read', validate(paramsSchema, 'params'), asyncHandler(controller.read));
router.post('/read-all', asyncHandler(controller.readAll));

module.exports = router;
