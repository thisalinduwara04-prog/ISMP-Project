import { Link, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useIdleTimer } from '../auth/useIdleTimer';
import { ROLE_LABELS, DEPARTMENT_LABELS } from '../constants';
import AdminIcon from './AdminIcon';
import AdminSidebar from './AdminSidebar';

// First word of the full name, so the greeting reads "Welcome, Dilhan" rather
// than repeating the whole name the identity line already carries. Falls back
// to the whole string when there is no space in it.
const firstNameOf = (fullName = '') => fullName.trim().split(/\s+/)[0] || fullName;

const AdminLayout = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // US-005, same rule as the employee shell: an unattended shared terminal
  // signs itself out. Repeated here rather than lifted into a shared parent -
  // the two shells are independent, and one hook call is cheaper than the
  // coupling a shared wrapper would introduce.
  useIdleTimer(
    async () => {
      await logout();
      navigate('/login', { replace: true, state: { reason: 'idle' } });
    },
    { enabled: isAuthenticated, timeoutMinutes: 30 }
  );

  return (
    <div className="admin-shell">
      <AdminSidebar />

      <div className="admin-shell__body">
        <header className="admin-shell__header">
          <div>
            <h1 className="admin-shell__title">Welcome, {firstNameOf(user?.fullName)}</h1>
            <p className="admin-shell__subtitle">
              {ROLE_LABELS[user?.role]} · {DEPARTMENT_LABELS[user?.department]}
            </p>
          </div>

          <div className="admin-shell__controls">
            <Link to="/notifications" className="btn btn--ghost btn--sm">
              <AdminIcon name="bell" />
              Notifications
            </Link>
            <Link to="/change-password" className="btn btn--ghost btn--sm">
              <AdminIcon name="key" />
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
              <AdminIcon name="exit" />
              Sign out
            </button>
          </div>
        </header>

        <main className="admin-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
