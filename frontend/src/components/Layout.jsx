import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useIdleTimer } from '../auth/useIdleTimer';
import { CAPABILITIES, ROLE_LABELS, DEPARTMENT_LABELS, homePathFor } from '../constants';

// Capability-filtered, in the same shape as the TILES array on the admin
// console. `capability: null` means "every signed-in user".
const NAV_ITEMS = [
  { to: '/my-tasks', label: 'My tasks', capability: null, end: true },
  { to: '/department', label: 'Department', capability: CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT },
  { to: '/admin', label: 'Admin', capability: CAPABILITIES.USER_MANAGE },
  { to: '/incidents', label: 'Incidents', capability: CAPABILITIES.INCIDENT_VIEW_OWN, end: true },
];

const Layout = () => {
  const { user, logout, isAuthenticated, can } = useAuth();
  const navigate = useNavigate();

  const navItems = NAV_ITEMS.filter((item) => !item.capability || can(item.capability));

  // US-005: an unattended shared terminal signs itself out.
  useIdleTimer(
    async () => {
      await logout();
      navigate('/login', { replace: true, state: { reason: 'idle' } });
    },
    { enabled: isAuthenticated, timeoutMinutes: 30 }
  );

  return (
    <div className="app">
      <header className="topbar">
        <Link to={homePathFor(user)} className="topbar__brand">
          <span className="topbar__mark">SV</span>
          <span>
            <strong>Savikro</strong>
            <small>Security Policy &amp; Compliance</small>
          </span>
        </Link>

        {user && (
          <div className="topbar__user">
            <div className="topbar__identity">
              <strong>{user.fullName}</strong>
              <small>
                {ROLE_LABELS[user.role]} · {DEPARTMENT_LABELS[user.department]}
              </small>
            </div>
            {/* UC-22: reporting must be one tap from anywhere, so it sits in the
                header on every screen rather than behind a menu. */}
            <Link to="/incidents/new" className="btn btn--primary btn--sm">
              Report an incident
            </Link>
            <Link to="/change-password" className="btn btn--ghost btn--sm">
              Password
            </Link>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {user && navItems.length > 1 && (
        <nav className="nav" aria-label="Main">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
