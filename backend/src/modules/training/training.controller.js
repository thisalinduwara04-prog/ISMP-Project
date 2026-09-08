const asyncHandler = require('../../utils/asyncHandler');
const { OK, CREATED } = require('../../constants/http');
const trainingService = require('./training.service');

// HTTP only: read the request, call one service, shape the response. No rule
// lives here - not the answer-key projection, not the audience check, not the
// role check. All three are the service's and the router's, so removing a
// screen from React changes nothing about what the API allows.

const ok = (req, data) => ({ success: true, data, requestId: req.id });

// --- T2: authoring ---

const createModule = asyncHandler(async (req, res) => {
  const module = await trainingService.createModule(req.body, req.user, req);
  return res.status(CREATED).json(ok(req, { module }));
});

const updateModule = asyncHandler(async (req, res) => {
  const result = await trainingService.updateModule(req.params.id, req.body, req.user, req);
  return res.status(OK).json(ok(req, result));
});

// --- Reads ---

const listModules = asyncHandler(async (req, res) => {
  const modules = await trainingService.listModules(req.user);
  return res.status(OK).json(ok(req, { modules, count: modules.length }));
});

// One route, two projections, chosen in the service by who is asking: an admin
// gets the answer key because they are editing it, everybody else gets the
// learner view (AD-3).
const getModule = asyncHandler(async (req, res) => {
  const module = await trainingService.getModule(req.params.id, req.user, req);
  return res.status(OK).json(ok(req, { module }));
});

// --- T3: publish ---

const publishModule = asyncHandler(async (req, res) => {
  const result = await trainingService.publishModule(req.params.id, req.user, req);
  return res.status(OK).json(ok(req, result));
});

module.exports = { createModule, updateModule, listModules, getModule, publishModule };
