import { Link, NavLink } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { CAPABILITIES, ROLES, homePathFor } from '../constants';
import Icon from './Icon';

// Module-wise navigation, for every role.
//
// Filtered by capability, like the tiles this replaced: an affordance, never the
// control (NFR-SEC-03). Every route below stays reachable by URL and the API
// enforces access exactly as before.
//
// Two items also declare `roles`, because capability alone gets them wrong:
//   My tasks    every role holds TRAINING_COMPLETE, but an administrator's own
//               landing screen is the dashboard - offering both is noise.
//   Department  an administrator holds COMPLIANCE_VIEW_DEPARTMENT incidentally
//               and has the organisation-wide view instead.
// Both routes stay reachable by URL for an admin who wants them.
const NAV_ITEMS = [
  {
    to: '/my-tasks',
    label: 'My tasks',
    icon: 'tasks',
    capability: CAPABILITIES.TRAINING_COMPLETE,
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER],
    end: true,
  },
  {
    to: '/department',
    label: 'Department',
    icon: 'team',
    capability: CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT,
    roles: [ROLES.MANAGER],
  },
  {
    to: '/admin',
    label: 'Dashboard',
    icon: 'dashboard',
    capability: CAPABILITIES.USER_MANAGE,
    end: true,
  },
  { to: '/admin/users', label: 'Users', icon: 'users', capability: CAPABILITIES.USER_MANAGE },
  {
    to: '/policies',
    label: 'Policies',
    icon: 'policies',
    capability: CAPABILITIES.POLICY_VIEW_ASSIGNED,
  },
  {
    to: '/training',
    label: 'Training',
    icon: 'training',
    capability: CAPABILITIES.TRAINING_COMPLETE,
  },
  {
    to: '/compliance',
    label: 'Compliance',
    icon: 'compliance',
    capability: CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION,
  },
  {
    to: '/incidents',
    label: 'Incidents',
    icon: 'incidents',
    capability: CAPABILITIES.INCIDENT_VIEW_OWN,
    end: true,
  },
  { to: '/admin/audit-logs', label: 'Audit log', icon: 'audit', capability: CAPABILITIES.AUDIT_VIEW },
];

const ShellSidebar = () => {
  const { user, can } = useAuth();

  const items = NAV_ITEMS.filter(
    (item) => can(item.capability) && (!item.roles || item.roles.includes(user?.role))
  );

  return (
    <aside className="app-shell__sidebar">
      <Link to={homePathFor(user)} className="app-shell__brand">
        <span className="app-shell__mark">SV</span>
        <span className="app-shell__brand-text">
          Savikro
          <small>Policy &amp; Compliance</small>
        </span>
      </Link>

      <nav className="shell-nav" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? 'shell-nav__link shell-nav__link--active' : 'shell-nav__link'
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default ShellSidebar;
