const asyncHandler = require('../../utils/asyncHandler');
const { OK, CREATED } = require('../../constants/http');
const userService = require('./user.service');

// Controllers do HTTP only: read the request, call one service, shape the
// response. No business rules live here - not even a role check, which is the
// router's job and the service's assumption.

const ok = (req, data) => ({ success: true, data, requestId: req.id });

const listUsers = asyncHandler(async (req, res) => {
  const data = await userService.listUsers(req.query);
  return res.status(OK).json(ok(req, data));
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUser(req.params.id);
  return res.status(OK).json(ok(req, { user }));
});

// The only endpoint in the system that returns a password. It is returned
// exactly once, at first issue, for the admin to hand over - there is no route
// that can read it back afterwards (NFR-SEC-02).
const createUser = asyncHandler(async (req, res) => {
  const result = await userService.createUser(req.body, req.user, req);
  return res.status(CREATED).json(ok(req, result));
});

const updateUser = asyncHandler(async (req, res) => {
  const result = await userService.updateUser(req.params.id, req.body, req.user, req);
  return res.status(OK).json(ok(req, result));
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await userService.resetPassword(req.params.id, req.user, req);
  return res.status(OK).json(ok(req, result));
});

module.exports = { listUsers, getUser, createUser, updateUser, resetPassword };
