import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { DEPARTMENT_LABELS, ROLE_LABELS, USER_STATUS_LABELS } from '../constants';
import { formatDateTime } from '../utils/format';

// The avatar in the shell header, and the account summary that drops down from
// it. A dropdown rather than a centred modal: it is a glance at your own
// details, and a panel that opens where you clicked keeps you in place.
//
// Read-only. Everything shown comes from the signed-in session, which already
// carries all of it, so opening costs no request. The one self-service change -
// the password - is linked from the foot.
//
// Same two-state pattern as Modal, for the same reason: the exit animation needs
// the panel to outlive `open`. EXIT_MS must match the transition in shell.css.
const EXIT_MS = 160;

// Up to two letters, from the first and last word of the name.
export const initialsOf = (fullName = '') => {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
};

const ProfileMenu = () => {
  const { user } = useAuth();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Closes on Escape (returning focus to the avatar) and on any press outside
  // the avatar and the panel. mousedown rather than click, so the panel is
  // already gone by the time whatever was pressed reacts.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  // Following any link - including the one in the panel - leaves it closed.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (shown) panelRef.current?.focus();
  }, [shown]);

  if (!user) return null;

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="shell-avatar"
        aria-label="Your profile"
        title="Your profile"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="profile-menu-panel"
        onClick={() => setOpen((current) => !current)}
      >
        {initialsOf(user.fullName)}
      </button>

      {mounted && (
        <div
          id="profile-menu-panel"
          className={`profile-menu__panel${shown ? ' profile-menu__panel--shown' : ''}`}
          role="dialog"
          aria-label="Your profile"
          tabIndex={-1}
          ref={panelRef}
        >
          <div className="profile-menu__head">
            <span className="profile-menu__avatar" aria-hidden="true">
              {initialsOf(user.fullName)}
            </span>
            <div className="profile-menu__who">
              <strong>{user.fullName}</strong>
              <span>{user.employeeId}</span>
              <span className="profile-menu__email">{user.email}</span>
            </div>
          </div>

          <dl className="profile-menu__details">
            <dt>Role</dt>
            <dd>{ROLE_LABELS[user.role] || user.role}</dd>

            <dt>Department</dt>
            <dd>{DEPARTMENT_LABELS[user.department] || user.department}</dd>

            {user.jobTitle && (
              <>
                <dt>Job title</dt>
                <dd>{user.jobTitle}</dd>
              </>
            )}

            <dt>Status</dt>
            <dd>{USER_STATUS_LABELS[user.status] || user.status}</dd>

            <dt>Last sign-in</dt>
            <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Not recorded'}</dd>

            {user.createdAt && (
              <>
                <dt>Member since</dt>
                <dd>{formatDateTime(user.createdAt)}</dd>
              </>
            )}
          </dl>

          <div className="profile-menu__foot">
            <Link to="/change-password" className="btn btn--ghost btn--sm">
              Change password
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
