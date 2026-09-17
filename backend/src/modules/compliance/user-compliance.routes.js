const express = require('express');

const controller = require('./compliance.controller');
const { authenticate } = require('../../middleware/authenticate');
const { resolveScope } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { userParamsSchema } = require('./compliance.schemas');

const router = express.Router();

router.get(
  '/:id/compliance',
  authenticate,
  validate(userParamsSchema, 'params'),
  asyncHandler(resolveScope),
  asyncHandler(controller.userCompliance)
);

module.exports = router;
