const User = require('../../models/User');
const AppError = require('../../utils/AppError');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const audit = require('../audit/audit.service');
const assignmentService = require('../assignment/assignment.service');
const { generateTemporaryPassword } = require('../auth/password.service');
const { revokeAllForUser } = require('../auth/token.service');
const { BAD_REQUEST, NOT_FOUND, CONFLICT } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');
const { USER_STATUS } = require('../../constants/roles');

// Spec section 8.2. The CRUD is the boring part; three rules are not:
//
//   1. A temporary password is generated server-side, shown to the admin once,
//      and never retrievable again (UC-01).
//   2. A role, department or status change must invalidate every credential
//      already issued to that account, in the same request (US-007, AD-6).
//   3. An admin may not change their own role or deactivate themselves, which
//      would leave the organisation with no way back in (UC-05).

// The module's own projection. Starts from the model's `toSafeJSON` - the
// canonical client shape - and adds the few fields an admin needs that an
// employee has no business seeing. `passwordHash` and `tokenVersion` are absent
// from both, so neither can leak through this path.
const toAdminView = (user) => ({
  ...user.toSafeJSON(),
  jobTitle: user.jobTitle || null,
  // `isLocked` is a virtual over `lockedUntil`, which is `select: false`. Reads
  // that did not ask for it report false rather than undefined.
  isLocked: user.isLocked,
  lockedUntil: user.lockedUntil || null,
  failedLoginAttempts: user.failedLoginAttempts || 0,
  createdBy: user.createdBy ? user.createdBy.toString() : null,
  updatedAt: user.updatedAt,
});

// Lock state is `select: false` on the model, so any read that renders it has to
// ask. Kept in one place so a new read cannot forget and silently report every
// account as unlocked.
const WITH_LOCK_STATE = '+failedLoginAttempts +lockedUntil';

// A search box must not be able to smuggle a pattern into the query. Escaping
// means `.*` looks for those literal characters and matches nobody, rather than
// returning the entire roster.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findOr404 = async (id, { withLockState = false } = {}) => {
  const query = User.findById(id);
  if (withLockState) query.select(WITH_LOCK_STATE);

  const user = await query;
  AppAssert(user, NOT_FOUND, 'User not found.', AppErrorCode.NOT_FOUND);
  return user;
};

// Ends every session belonging to a user. Both halves are needed: revoking the
// refresh tokens alone would leave an access token already in the wild working
// for up to its full 15 minutes, which is exactly the gap US-007 closes.
// The caller is responsible for saving the user document afterwards.
const endAllSessions = async (user) => {
  user.tokenVersion += 1;
  await revokeAllForUser(user._id);
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const listUsers = async ({ department, role, status, q, page = 1, limit = 25 } = {}) => {
  const filter = {
    ...(department ? { department } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  };

  if (q) {
    const term = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ fullName: term }, { employeeId: term }, { email: term }];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter).select(WITH_LOCK_STATE).sort({ fullName: 1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    users: users.map(toAdminView),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getUser = async (id) => {
  const user = await findOr404(id, { withLockState: true });
  return toAdminView(user);
};

// ---------------------------------------------------------------------------
// Create (UC-01)
// ---------------------------------------------------------------------------

// The unique indexes are the real guard against a duplicate, and the error
// handler already turns a Mongo 11000 into a 409. This pre-check exists only to
// say WHICH field collided, because "that employee ID is already in use" is
// actionable and "duplicate resource" is not.
const assertUnique = async ({ employeeId, email }, excludeId = null) => {
  const clash = await User.findOne({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: [...(employeeId ? [{ employeeId }] : []), ...(email ? [{ email }] : [])],
  });

  if (!clash) return;

  const field = employeeId && clash.employeeId === employeeId ? 'employeeId' : 'email';

  throw new AppError(
    CONFLICT,
    field === 'employeeId'
      ? 'That employee ID is already in use.'
      : 'That email address is already in use.',
    AppErrorCode.DUPLICATE_RESOURCE,
    [{ field, issue: 'already_exists' }]
  );
};

const createUser = async (input, actor, req) => {
  await assertUnique({ employeeId: input.employeeId, email: input.email });

  // Assigning the plaintext is correct: the model's pre-save hook hashes it.
  // The plaintext exists only in this function and in the response.
  const temporaryPassword = generateTemporaryPassword();

  const user = await User.create({
    ...input,
    passwordHash: temporaryPassword,
    status: USER_STATUS.ACTIVE,
    mustChangePassword: true,
    createdBy: actor._id,
  });

  // Fan-out ran when each policy and module was published, which was before
  // this person existed. Without this they would see their department's
  // policies and be refused when they tried to acknowledge one.
  const backfill = await assignmentService.backfillForUser(user);

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.USER_CREATED,
    entityType: AUDIT_ENTITY_TYPE.USER,
    entityId: user._id,
    // Never the password. What matters afterwards is who was granted what.
    metadata: {
      employeeId: user.employeeId,
      role: user.role,
      department: user.department,
      assignmentsAssigned: backfill.assignedCount,
    },
    req,
  });

  return { user: toAdminView(user), temporaryPassword, assignmentsAssigned: backfill.assignedCount };
};

// ---------------------------------------------------------------------------
// Update (UC-05)
// ---------------------------------------------------------------------------

// Fields that change what an account may do or see. A change to any of them
// ends the account's sessions; a change to none of them does not, so correcting
// a typo in someone's name does not sign them out.
const PRIVILEGE_FIELDS = ['role', 'department', 'status'];

const diffOf = (user, patch) =>
  Object.entries(patch).reduce((changes, [field, next]) => {
    const current = user[field] === undefined ? null : user[field];
    if (current === next) return changes;
    return { ...changes, [field]: { from: current === undefined ? null : current, to: next } };
  }, {});

const updateUser = async (id, patch, actor, req) => {
  const user = await findOr404(id, { withLockState: true });
  const isSelf = actor._id.equals(user._id);

  // An admin editing their own name is ordinary housekeeping. An admin changing
  // their own role or switching themselves off is how an organisation ends up
  // locked out of its own platform, so it is refused rather than warned about.
  if (isSelf && (patch.role !== undefined || patch.status !== undefined)) {
    throw new AppError(
      BAD_REQUEST,
      'You cannot change your own role or deactivate your own account. Ask another administrator.',
      AppErrorCode.CANNOT_MODIFY_SELF,
      [{ field: patch.role !== undefined ? 'role' : 'status', issue: 'cannot_modify_self' }]
    );
  }

  if (patch.email) await assertUnique({ email: patch.email }, user._id);

  const changes = diffOf(user, patch);

  // Nothing actually differs. Returning early keeps the audit log free of
  // entries that record no change, which is what makes the rest worth reading.
  if (Object.keys(changes).length === 0) return { user: toAdminView(user) };

  Object.assign(user, patch);

  if (PRIVILEGE_FIELDS.some((field) => changes[field])) await endAllSessions(user);

  await user.save();

  // The ledger carries copies of department and role so the dashboard can group
  // without a $lookup. This is the moment they go stale, so this is the moment
  // they are refreshed (risk R-03).
  if (changes.department || changes.role) {
    await assignmentService.refreshUserDenormalisation({
      userId: user._id,
      department: user.department,
      userRole: user.role,
    });
  }

  // Moving somebody into a new audience, or switching an account back on, both
  // leave them missing whatever was published to that audience in the meantime
  // - fan-out only ever saw the population as it stood at the time. Reconciled
  // here for the same reason as on create.
  //
  // The reverse case - work they keep but can no longer reach because the item
  // no longer targets them - is left open deliberately; see the TODO on
  // `backfillForUser`. It belongs with M4's sweep.
  let assignmentsAssigned = 0;
  if (changes.department || changes.role || changes.status) {
    ({ assignedCount: assignmentsAssigned } = await assignmentService.backfillForUser(user));
  }

  // One edit can be several security events at once - a transfer that is also a
  // promotion - so each is recorded under the action a reviewer would filter on
  // rather than collapsed into one generic entry.
  const common = {
    entityType: AUDIT_ENTITY_TYPE.USER,
    entityId: user._id,
    req,
  };

  // Recorded on whichever entries this edit produces: "the transfer also gave
  // them 3 new obligations" is part of what the transfer did.
  const withBackfill = (metadata) =>
    assignmentsAssigned > 0 ? { ...metadata, assignmentsAssigned } : metadata;

  if (changes.role) {
    await audit.recordForUser(actor, {
      ...common,
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      metadata: withBackfill({ from: changes.role.from, to: changes.role.to }),
    });
  }

  if (changes.status) {
    await audit.recordForUser(actor, {
      ...common,
      action:
        changes.status.to === USER_STATUS.INACTIVE
          ? AUDIT_ACTIONS.USER_DEACTIVATED
          : AUDIT_ACTIONS.USER_REACTIVATED,
      metadata: withBackfill({ employeeId: user.employeeId }),
    });
  }

  const remaining = Object.fromEntries(
    Object.entries(changes).filter(([field]) => field !== 'role' && field !== 'status')
  );

  if (Object.keys(remaining).length > 0) {
    await audit.recordForUser(actor, {
      ...common,
      action: AUDIT_ACTIONS.USER_UPDATED,
      metadata: withBackfill({ changes: remaining }),
    });
  }

  return { user: toAdminView(user) };
};

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

const resetPassword = async (id, actor, req) => {
  const user = await findOr404(id, { withLockState: true });

  const temporaryPassword = generateTemporaryPassword();

  user.passwordHash = temporaryPassword;
  user.mustChangePassword = true;
  // A reset is also the admin's unlock: someone who has forgotten their password
  // has usually locked themselves out trying to remember it, and leaving the
  // lock in place would make the new password unusable for another 15 minutes
  // (UC-02, 5a).
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;

  await endAllSessions(user);
  await user.save();

  await audit.recordForUser(actor, {
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entityType: AUDIT_ENTITY_TYPE.USER,
    entityId: user._id,
    metadata: { employeeId: user.employeeId },
    req,
  });

  return { user: toAdminView(user), temporaryPassword };
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetPassword,
  toAdminView,
};
