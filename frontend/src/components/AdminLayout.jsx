import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useIdleTimer } from '../auth/useIdleTimer';
import { getNotifications } from '../api/notifications';
import { ROLE_LABELS, DEPARTMENT_LABELS } from '../constants';
import AdminIcon from './AdminIcon';
import AdminSidebar from './AdminSidebar';

// First word of the full name, so the greeting reads "Welcome, Dilhan" rather
// than repeating the whole name the identity line already carries. Falls back
// to the whole string when there is no space in it.
const firstNameOf = (fullName = '') => fullName.trim().split(/\s+/)[0] || fullName;

// Up to two letters, from the first and last word of the name.
const initialsOf = (fullName = '') => {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
};

const AdminLayout = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [unread, setUnread] = useState(0);

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

  // Re-read on navigation rather than on a timer: the count only changes when
  // the admin acts, and opening the notifications screen is the one moment it
  // reliably goes stale. A failure leaves the badge hidden rather than breaking
  // the shell - a count is not worth blanking the application for.
  useEffect(() => {
    let active = true;

    getNotifications()
      .then((data) => {
        if (active) setUnread(data.unread || 0);
      })
      .catch(() => {
        if (active) setUnread(0);
      });

    return () => { active = false; };
  }, [location.pathname]);

  const notificationsLabel = unread > 0
    ? `Notifications, ${unread} unread`
    : 'Notifications';

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

          {/* Icon-only, so each control carries its name in aria-label and
              title rather than on screen. Only controls that actually do
              something are here - no search box or theme switch, because
              neither exists behind them. */}
          <div className="admin-shell__controls">
            <Link
              to="/notifications"
              className="admin-icon-btn"
              aria-label={notificationsLabel}
              title={notificationsLabel}
            >
              <AdminIcon name="bell" className="admin-icon-btn__glyph" />
              {unread > 0 && (
                <span className="admin-icon-btn__badge" aria-hidden="true">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            <Link
              to="/change-password"
              className="admin-icon-btn"
              aria-label="Change password"
              title="Change password"
            >
              <AdminIcon name="key" className="admin-icon-btn__glyph" />
            </Link>

            <button
              type="button"
              className="admin-icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <AdminIcon name="exit" className="admin-icon-btn__glyph" />
            </button>

            {/* Decorative: the name it abbreviates is already the page heading
                directly to the left, so announcing it again adds nothing. */}
            <span className="admin-avatar" aria-hidden="true">
              {initialsOf(user?.fullName)}
            </span>
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
