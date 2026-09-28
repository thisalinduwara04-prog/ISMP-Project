import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useIdleTimer } from '../auth/useIdleTimer';
import { getNotifications } from '../api/notifications';
import { CAPABILITIES, DEPARTMENT_LABELS, ROLE_LABELS, homePathFor } from '../constants';
import Icon from './Icon';
import ProfileMenu from './ProfileMenu';
import ShellSidebar from './ShellSidebar';

// The shell every signed-in screen renders inside.
//
// There used to be two: this one for administrators, and a navy top-bar layout
// for everyone else. They are one now. The employee and manager screens were the
// only thing left on the old theme, and a compliance tool that looks like two
// different products depending on who signed in is harder to explain than it is
// to fix. ShellSidebar decides which nav items a role sees; nothing else differs.

// First word of the full name, so the greeting reads "Welcome, Dilhan" rather
// than repeating the whole name the identity line already carries. Falls back
// to the whole string when there is no space in it.
const firstNameOf = (fullName = '') => fullName.trim().split(/\s+/)[0] || fullName;

const AppShell = () => {
  const { user, logout, isAuthenticated, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [unread, setUnread] = useState(0);

  // US-005: an unattended shared terminal signs itself out.
  useIdleTimer(
    async () => {
      await logout();
      navigate('/login', { replace: true, state: { reason: 'idle' } });
    },
    { enabled: isAuthenticated, timeoutMinutes: 30 }
  );

  // Re-read on navigation rather than on a timer: the count only changes when
  // the user acts, and opening the notifications screen is the one moment it
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

  // The greeting is the page's <h1> on the landing screen, where there is no
  // other title. Everywhere else the screen has its own heading, so the identity
  // drops to a plain line - two <h1>s on one page is a worse outcome than a
  // smaller welcome (NFR-USE-03).
  const onHome = location.pathname === homePathFor(user);

  return (
    <div className="app-shell">
      <ShellSidebar />

      <div className="app-shell__body">
        <header className="app-shell__header">
          <div>
            {onHome ? (
              <>
                <h1 className="app-shell__title">
                  Welcome, {firstNameOf(user?.fullName)}{' '}
                  {/* Decorative, so a screen reader hears just the greeting. */}
                  <span aria-hidden="true">👋</span>
                </h1>
                <p className="app-shell__subtitle">
                  {ROLE_LABELS[user?.role]} · {DEPARTMENT_LABELS[user?.department]}
                </p>
              </>
            ) : (
              <p className="app-shell__subtitle">
                {user?.fullName} · {ROLE_LABELS[user?.role]} ·{' '}
                {DEPARTMENT_LABELS[user?.department]}
              </p>
            )}
          </div>

          <div className="app-shell__actions">
            {/* Reporting is the one thing on any screen that may be urgent, so
                it is reachable from every screen rather than only from the
                incidents page. Capability-filtered like everything else here -
                an affordance, never the control (NFR-SEC-03). */}
            {can(CAPABILITIES.INCIDENT_SUBMIT) && (
              <Link to="/incidents/new" className="btn btn--primary">
                Report an incident
              </Link>
            )}

            {/* Icon-only, so each control carries its name in aria-label and
                title rather than on screen. Only controls that actually do
                something are here - no search box or theme switch, because
                neither exists behind them. */}
            <div className="app-shell__controls">
            <Link
              to="/notifications"
              className="shell-icon-btn"
              aria-label={notificationsLabel}
              title={notificationsLabel}
            >
              <Icon name="bell" className="shell-icon-btn__glyph" />
              {unread > 0 && (
                <span className="shell-icon-btn__badge" aria-hidden="true">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            <Link
              to="/change-password"
              className="shell-icon-btn"
              aria-label="Change password"
              title="Change password"
            >
              <Icon name="key" className="shell-icon-btn__glyph" />
            </Link>

            <button
              type="button"
              className="shell-icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <Icon name="exit" className="shell-icon-btn__glyph" />
            </button>

              <ProfileMenu />
            </div>
          </div>
        </header>

        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
