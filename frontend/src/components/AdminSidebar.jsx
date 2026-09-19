import { Link, NavLink } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { CAPABILITIES } from '../constants';
import AdminIcon from './AdminIcon';

// Module-wise navigation for the administrator shell.
//
// My tasks and Department are deliberately absent: both are built for other
// roles, and an admin holds COMPLIANCE_VIEW_DEPARTMENT only incidentally. This
// removes them from NAVIGATION only - both routes stay reachable by URL and the
// API enforces access exactly as before.
//
// Capability-filtered like the tiles it replaces: an affordance, never the
// control (NFR-SEC-03).
const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: 'dashboard', capability: CAPABILITIES.USER_MANAGE, end: true },
  { to: '/admin/users', label: 'Users', icon: 'users', capability: CAPABILITIES.USER_MANAGE },
  { to: '/policies', label: 'Policies', icon: 'policies', capability: CAPABILITIES.POLICY_AUTHOR },
  { to: '/training', label: 'Training', icon: 'training', capability: CAPABILITIES.TRAINING_AUTHOR },
  { to: '/compliance', label: 'Compliance', icon: 'compliance', capability: CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION },
  { to: '/incidents', label: 'Incidents', icon: 'incidents', capability: CAPABILITIES.INCIDENT_TRIAGE, end: true },
  { to: '/admin/audit-logs', label: 'Audit log', icon: 'audit', capability: CAPABILITIES.AUDIT_VIEW },
];

const AdminSidebar = () => {
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((item) => can(item.capability));

  return (
    <aside className="admin-shell__sidebar">
      <Link to="/admin" className="admin-shell__brand">
        <span className="topbar__mark">SV</span>
        <span>Savikro</span>
      </Link>

      <nav className="admin-nav" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
            <AdminIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
