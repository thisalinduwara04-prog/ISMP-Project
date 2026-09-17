const express = require('express');

const controller = require('./user.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability } = require('../../middleware/authorize');
const { CAPABILITIES } = require('../../constants/permissions');
const {
  userParams,
  createUserSchema,
  updateUserSchema,
  listUsersQuery,
} = require('./user.schemas');

const router = express.Router();

// Every route needs a session, and an account still holding a temporary
// password may not do normal work until it has been changed (US-003).
router.use(authenticate, requirePasswordChanged);

// Spec section 8.2 also names MANAGER on the two read routes, scoped to their
// own department. Managers hold no USER_MANAGE capability and have no route
// into this screen; a department roster is a compliance question and is served
// by M4's dashboard (UC-19). Kept admin-only here rather than inventing an RBAC
// surface with no consumer.
const requireUserManage = requireCapability(CAPABILITIES.USER_MANAGE);

// No `resolveScope`: this module is organisation-wide by definition, so there
// is no department parameter to narrow and none is accepted.
router.get('/', requireUserManage, validate(listUsersQuery, 'query'), controller.listUsers);

router.post('/', requireUserManage, validate(createUserSchema), controller.createUser);

// Params are validated before the body throughout, so a malformed id fails as a
// 400 naming the id rather than as a confusing body error.
router.get('/:id', requireUserManage, validate(userParams, 'params'), controller.getUser);

router.patch(
  '/:id',
  requireUserManage,
  validate(userParams, 'params'),
  validate(updateUserSchema),
  controller.updateUser
);

// POST rather than PATCH: this is not an edit to a field, it is an action with
// side effects - a new credential is minted and every session is ended.
router.post(
  '/:id/reset-password',
  requireUserManage,
  validate(userParams, 'params'),
  controller.resetPassword
);

module.exports = router;
