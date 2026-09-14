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

// Permanent, and destroys the quiz attempts recorded against the module. The
// service refuses without an explicit confirmation whenever there is evidence
// to lose, so the first call doubles as "tell me what this would destroy".
const deleteModule = asyncHandler(async (req, res) => {
  const result = await trainingService.destroy(req.params.id, req.body, req.user, req);
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
// An admin gets { module } alone; a learner also gets { task } - their own
// progress, and the state of their quiz attempts.
const getModule = asyncHandler(async (req, res) => {
  const result = await trainingService.getModule(req.params.id, req.user, req);
  return res.status(OK).json(ok(req, result));
});

// Who has completed the module and who has not — both halves in one response,
// so the summary and the tables cannot disagree.
const listCompletions = asyncHandler(async (req, res) => {
  const data = await trainingService.listCompletions(req.params.id, req.user, req);
  return res.status(OK).json(ok(req, data));
});

// --- T3: publish ---

const publishModule = asyncHandler(async (req, res) => {
  const result = await trainingService.publishModule(req.params.id, req.user, req);
  return res.status(OK).json(ok(req, result));
});

// --- T4: progress ---

const markProgress = asyncHandler(async (req, res) => {
  const result = await trainingService.markItemComplete(
    req.params.id,
    req.body.itemId,
    req.user,
    req
  );
  return res.status(OK).json(ok(req, result));
});

// --- T5: the attempt lifecycle ---

const startAttempt = asyncHandler(async (req, res) => {
  const result = await trainingService.startAttempt(req.params.id, req.user, req);
  // 200 when an attempt already in progress was handed back, 201 when a new one
  // was opened - the difference matters to a client deciding whether to warn
  // "you have already used an attempt".
  return res.status(result.resumed ? OK : CREATED).json(ok(req, result));
});

const saveAttempt = asyncHandler(async (req, res) => {
  const result = await trainingService.saveAttempt(
    req.params.aid,
    req.body.responses,
    req.user,
    req
  );
  return res.status(OK).json(ok(req, result));
});

const submitAttempt = asyncHandler(async (req, res) => {
  const result = await trainingService.submitAttempt(req.params.aid, req.user, req);
  return res.status(OK).json(ok(req, result));
});

const getAttempt = asyncHandler(async (req, res) => {
  const result = await trainingService.getAttempt(req.params.aid, req.user, req);
  return res.status(OK).json(ok(req, result));
});

// --- T6: admin reset ---

const resetAttempts = asyncHandler(async (req, res) => {
  const result = await trainingService.resetAttempts(
    req.params.id,
    req.body.userId,
    req.user,
    req
  );
  return res.status(OK).json(ok(req, result));
});

module.exports = {
  createModule,
  updateModule,
  deleteModule,
  listModules,
  listCompletions,
  getModule,
  publishModule,
  markProgress,
  startAttempt,
  saveAttempt,
  submitAttempt,
  getAttempt,
  resetAttempts,
};
