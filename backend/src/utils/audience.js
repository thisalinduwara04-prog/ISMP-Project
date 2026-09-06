const { USER_STATUS } = require('../constants/roles');

// ---------------------------------------------------------------------------
// Audience targeting - one implementation, used by M2 and M3.
// ---------------------------------------------------------------------------
//
// Policy versions and training modules are aimed the same way: two arrays,
// `targetRoles` and `targetDepartments`, where an EMPTY array means "everyone"
// rather than "nobody". A user matches when
//
//     (targetRoles is empty       OR includes user.role)
//   AND (targetDepartments is empty OR includes user.department)
//
// This lives in utils rather than in either module's service for two reasons.
// T5 and T13 both require the identical rule, and duplicating it is how the
// two modules end up disagreeing about who can see what. It also keeps
// assignment.service (which needs the user-side filter) from having to import
// the policy service, which would be a cycle.
//
// The rule is applied SERVER-SIDE on every read. A user outside the audience
// gets 403 on a direct request by ID, not merely a shorter list (NFR-SEC-03).

// Mongo filter over policyVersions / trainingModules: "items aimed at this user".
const buildAudienceFilter = (user) => ({
  $and: [
    { $or: [{ targetRoles: { $size: 0 } }, { targetRoles: user.role }] },
    { $or: [{ targetDepartments: { $size: 0 } }, { targetDepartments: user.department }] },
  ],
});

// The same test applied in memory to one already-loaded item, for the
// single-document read path where a second query would be wasteful.
const matchesAudience = (item, user) => {
  const roles = item.targetRoles || [];
  const departments = item.targetDepartments || [];

  return (
    (roles.length === 0 || roles.includes(user.role)) &&
    (departments.length === 0 || departments.includes(user.department))
  );
};

// The inverse direction: Mongo filter over users, "everyone this item is aimed
// at". Only ACTIVE users are ever assigned - a leaver's account is deactivated
// rather than deleted (7.18), and assigning work to it would distort every
// compliance percentage.
const audienceUserFilter = ({ roles = [], departments = [] } = {}) => ({
  status: USER_STATUS.ACTIVE,
  ...(roles.length ? { role: { $in: roles } } : {}),
  ...(departments.length ? { department: { $in: departments } } : {}),
});

module.exports = { buildAudienceFilter, matchesAudience, audienceUserFilter };
