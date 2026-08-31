const AppError = require('../utils/AppError');
const AppErrorCode = require('../constants/appErrorCode');
const audit = require('../modules/audit/audit.service');
const { FORBIDDEN, UNAUTHORIZED } = require('../constants/http');
const { AUDIT_ACTIONS, AUDIT_OUTCOME } = require('../constants/auditActions');
const { ROLES } = require('../constants/roles');
const { roleHasCapability, capabilitiesForRole, SCOPE, MAX_SCOPE_FOR_ROLE } = require('../constants/permissions');

const notAuthenticated = () =>
  new AppError(UNAUTHORIZED, 'You must be logged in.', AppErrorCode.INVALID_ACCESS_TOKEN);

// Denials are audited, not just refused. A burst of RBAC_DENIED entries from
// one account is exactly the signal a privilege-escalation attempt produces
// (NFR-SEC-06).
const denyCapability = async (req, capability) => {
  await audit.record({
    action: AUDIT_ACTIONS.RBAC_DENIED,
    outcome: AUDIT_OUTCOME.DENIED,
    actorId: req.user._id,
    actorRole: req.user.role,
    metadata: { capability, method: req.method, path: req.originalUrl },
    req,
  });

  return new AppError(
    FORBIDDEN,
    'You do not have permission to perform this action.',
    AppErrorCode.INSUFFICIENT_PERMISSIONS
  );
};

// The primary guard. Always mounted after `authenticate`, which is what puts
// the freshly-loaded user (and therefore the current role) on the request.
const requireCapability = (...capabilities) => async (req, res, next) => {
  if (!req.user) return next(notAuthenticated());

  // Multiple capabilities are treated as "any of", which suits a route that
  // serves both a department and an organisation view.
  const granted = capabilities.some((c) => roleHasCapability(req.user.role, c));
  if (!granted) return next(await denyCapability(req, capabilities.join('|')));

  return next();
};

// Role checks remain available for the rare route that is genuinely about
// identity rather than an action, but capabilities are the default.
const requireRole = (...roles) => async (req, res, next) => {
  if (!req.user) return next(notAuthenticated());
  if (!roles.includes(req.user.role)) return next(await denyCapability(req, `role:${roles.join('|')}`));
  return next();
};

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------
//
// The half of RBAC that is easy to get wrong. A Manager passing
// ?department=SALES must not be able to read another department, so the
// answer is derived from req.user and the request is only ever allowed to
// NARROW it - never widen it.
//
// Attaches req.scope = { level, department, userId }.
const resolveScope = async (req, res, next) => {
  if (!req.user) return next(notAuthenticated());

  const { role, department } = req.user;
  const maxScope = MAX_SCOPE_FOR_ROLE[role] || SCOPE.SELF;
  // GET dashboards carry scope in the query string; POST exports carry it in
  // the validated body. Both are resolved by the same server-side rule.
  const requested = (req.query && req.query.department) || (req.body && req.body.department);

  if (role === ROLES.ADMIN) {
    // An admin may look at one department or at everything.
    req.scope = requested
      ? { level: SCOPE.DEPARTMENT, department: requested, userId: null }
      : { level: SCOPE.ORGANISATION, department: null, userId: null };
    return next();
  }

  if (role === ROLES.MANAGER) {
    // Asking for someone else's department is a deliberate act, not a typo,
    // so it is refused and audited rather than silently corrected (UC-19, 1a).
    if (requested && requested !== department) {
      await audit.record({
        action: AUDIT_ACTIONS.RBAC_SCOPE_VIOLATION,
        outcome: AUDIT_OUTCOME.DENIED,
        actorId: req.user._id,
        actorRole: role,
        metadata: { ownDepartment: department, requestedDepartment: requested, path: req.originalUrl },
        req,
      });

      return next(
        new AppError(
          FORBIDDEN,
          'You can only view data for your own department.',
          AppErrorCode.SCOPE_VIOLATION
        )
      );
    }

    // Forced server-side, so an absent or matching parameter both end up here.
    req.scope = { level: SCOPE.DEPARTMENT, department, userId: null };
    return next();
  }

  // Employees see themselves and nothing else.
  req.scope = { level: maxScope, department, userId: req.user._id };
  return next();
};

// Exposed on /auth/me so the SPA can hide controls the user cannot use. This
// is a usability affordance ONLY - the middleware above is the actual control
// (NFR-SEC-03).
const capabilitiesFor = (user) => capabilitiesForRole(user.role);

module.exports = { requireCapability, requireRole, resolveScope, capabilitiesFor };
