import { Link, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useIdleTimer } from '../auth/useIdleTimer';
import { ROLE_LABELS, DEPARTMENT_LABELS, homePathFor } from '../constants';

const Layout = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

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

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
