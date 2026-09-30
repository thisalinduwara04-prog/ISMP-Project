const express = require('express');

const controller = require('./compliance.controller');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { resolveScope } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { userParamsSchema } = require('./compliance.schemas');

const router = express.Router();

router.get(
  '/:id/compliance',
  authenticate,
  requirePasswordChanged,
  validate(userParamsSchema, 'params'),
  asyncHandler(resolveScope),
  asyncHandler(controller.userCompliance)
);

module.exports = router;
