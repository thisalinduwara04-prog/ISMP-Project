import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Badge from '../../components/Badge';
import CredentialPanel from '../../components/CredentialPanel';
import Spinner from '../../components/Spinner';
import { useAuth } from '../../auth/AuthContext';
import { fetchUser, resetUserPassword, updateUser } from '../../api/users';
import { DEPARTMENT_LABELS, ROLE_LABELS } from '../../constants';
import { formatDate, formatDateTime } from '../../utils/format';

// UC-05. One account: the facts that cannot be edited, the fields that can, and
// the two actions with consequences.
//
// Laid out as details first with the status alongside on the right, because the
// details are what an admin came here to change and the status is what they
// glance at. The details also come FIRST in DOM order, so on a phone - where
// the two columns stack - you land on the editable half rather than scrolling
// past a read-only summary to reach it.
//
// Confirmation is inline rather than a dialog, matching PolicyDetail - this
// codebase has no modal component and one screen is not the place to introduce
// the first.

const editableFrom = (user) => ({
  fullName: user.fullName,
  email: user.email,
  jobTitle: user.jobTitle || '',
  role: user.role,
  department: user.department,
  status: user.status,
});

const UserDetail = () => {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();

  const [user, setUser] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'status' | 'reset' | null
  const [issued, setIssued] = useState(null);

  // An admin cannot change their own role or switch themselves off - the API
  // refuses it, and offering the control anyway would just produce an error the
  // admin could not act on (UC-05).
  const isSelf = currentUser?.id === userId;

  const load = useCallback(async () => {
    setError(null);

    try {
      const data = await fetchUser(userId);
      setUser(data.user);
      setForm(editableFrom(data.user));
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value });
    setSaved(false);
  };

  // Send only what actually changed. A patch that restates the current values
  // would otherwise count as a privilege change and sign the person out for
  // nothing.
  const changedFields = form
    ? Object.fromEntries(
        Object.entries(form).filter(([field, value]) => {
          const current = field === 'jobTitle' ? user.jobTitle || '' : user[field];
          return value !== current;
        })
      )
    : {};

  const hasChanges = Object.keys(changedFields).length > 0;

  const applyPatch = async (patch) => {
    setSaveError(null);
    setSaving(true);
    setSaved(false);

    try {
      const data = await updateUser(userId, patch);
      setUser(data.user);
      setForm(editableFrom(data.user));
      setSaved(true);
      setConfirming(null);
    } catch (patchError) {
      setSaveError(patchError);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaveError(null);
    setSaving(true);

    try {
      const data = await resetUserPassword(userId);
      setUser(data.user);
      setForm(editableFrom(data.user));
      setIssued(data.temporaryPassword);
      setConfirming(null);
    } catch (resetError) {
      setSaveError(resetError);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <header className="page__header">
          <Link to="/admin/users" className="btn btn--ghost btn--sm">
            ← All accounts
          </Link>
          <h1>Account</h1>
        </header>
        <Alert tone="error" title="Could not load this account">
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  if (!user) return <Spinner label="Loading the account…" />;

  const isInactive = user.status === 'INACTIVE';

  return (
    // The full-width page rather than `page--narrow`: two columns need the room.
    <div className="page">
      <header className="page__header">
        <Link to="/admin/users" className="btn btn--ghost btn--sm">
          ← All accounts
        </Link>
        <h1>{user.fullName}</h1>
        <p>
          {user.employeeId} · {DEPARTMENT_LABELS[user.department] || user.department} ·{' '}
          {ROLE_LABELS[user.role] || user.role}
        </p>
      </header>

      {/* Full width, above the columns: a password shown once should not be
          competing for attention in a side panel. */}
      {issued && (
        <CredentialPanel user={user} temporaryPassword={issued}>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setIssued(null)}
            >
              I have passed this on
            </button>
          </div>
        </CredentialPanel>
      )}

      <div className="detail-columns">
        <div className="detail-columns__main">
          <section className="card">
            <h2>Details</h2>

            {saveError && (
              <Alert title="Could not save">
                {saveError.message}
                {saveError.details?.length > 0 && (
                  <ul className="alert__list">
                    {saveError.details.map((detail) => (
                      <li key={`${detail.field}-${detail.issue}`}>
                        {detail.field}: {detail.issue}
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            {saved && !hasChanges && (
              <Alert tone="success" title="Saved">
                The account has been updated.
              </Alert>
            )}

            <label className="field" htmlFor="fullName">
              <span className="field__label">Full name</span>
              <input
                id="fullName"
                className="field__input"
                value={form.fullName}
                onChange={set('fullName')}
              />
            </label>

            <label className="field" htmlFor="email">
              <span className="field__label">Email</span>
              <input
                id="email"
                type="email"
                className="field__input"
                value={form.email}
                onChange={set('email')}
              />
            </label>

            <label className="field" htmlFor="jobTitle">
              <span className="field__label">Job title</span>
              <input
                id="jobTitle"
                className="field__input"
                value={form.jobTitle}
                onChange={set('jobTitle')}
              />
            </label>

            <label className="field" htmlFor="department">
              <span className="field__label">Department</span>
              <select
                id="department"
                className="field__input"
                value={form.department}
                onChange={set('department')}
                aria-describedby="department-help"
              >
                {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small id="department-help" className="field__help">
                Moving someone re-files their existing policy and training assignments under the
                new department, and signs them out of any open session.
              </small>
            </label>

            <label className="field" htmlFor="role">
              <span className="field__label">Role</span>
              <select
                id="role"
                className="field__input"
                value={form.role}
                onChange={set('role')}
                disabled={isSelf}
                aria-describedby="role-help"
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small id="role-help" className="field__help">
                {isSelf
                  ? 'You cannot change your own role. Ask another administrator.'
                  : 'Takes effect immediately — any session this person has open is ended.'}
              </small>
            </label>

            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!hasChanges || saving}
                onClick={() => applyPatch(changedFields)}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {hasChanges && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={saving}
                  onClick={() => {
                    setForm(editableFrom(user));
                    setSaveError(null);
                  }}
                >
                  Discard
                </button>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Access</h2>

            {isSelf ? (
              <p className="muted">
                You are looking at your own account. Deactivating it or resetting your own password
                here is not possible — another administrator must do it.
              </p>
            ) : (
              <>
                {confirming === 'reset' ? (
                  <>
                    <Alert tone="warning" title={`Reset the password for ${user.fullName}?`}>
                      A new temporary password will be issued and shown to you once. Any session
                      this person has open ends immediately, and their current password stops
                      working.
                    </Alert>
                    <div className="confirm-actions">
                      <button
                        type="button"
                        className="btn btn--danger"
                        disabled={saving}
                        onClick={handleReset}
                      >
                        {saving ? 'Resetting…' : 'Yes, reset the password'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : confirming === 'status' ? (
                  <>
                    <Alert
                      tone="warning"
                      title={
                        isInactive
                          ? `Restore access for ${user.fullName}?`
                          : `End access for ${user.fullName}?`
                      }
                    >
                      {isInactive
                        ? 'They will be able to sign in again with their existing password, and their outstanding policies and training reappear.'
                        : 'They will be signed out everywhere within seconds and will not be able to sign in again. The account is kept, not deleted, so the acknowledgements and quiz results they produced remain as evidence.'}
                    </Alert>
                    <div className="confirm-actions">
                      <button
                        type="button"
                        className={isInactive ? 'btn btn--primary' : 'btn btn--danger'}
                        disabled={saving}
                        onClick={() => applyPatch({ status: isInactive ? 'ACTIVE' : 'INACTIVE' })}
                      >
                        {saving ? 'Working…' : isInactive ? 'Yes, restore access' : 'Yes, end access'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setConfirming('reset')}
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      className={isInactive ? 'btn btn--ghost' : 'btn btn--danger'}
                      onClick={() => setConfirming('status')}
                    >
                      {isInactive ? 'Restore access' : 'Deactivate account'}
                    </button>
                  </div>
                )}

                {user.isLocked && confirming === null && (
                  <p className="field__help">
                    This account is locked after repeated failed sign-ins. It unlocks by itself at{' '}
                    {formatDateTime(user.lockedUntil)}, or immediately if you reset the password.
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        {/* Read-only, and deliberately compact: it answers "can this person get
            in right now?" at a glance while the details are being edited. */}
        <aside className="detail-columns__side">
          <section className="card card--compact">
            <h2>Account status</h2>

            <dl className="detail-list">
              <dt>Status</dt>
              <dd>
                <Badge tone={isInactive ? 'neutral' : 'ok'}>
                  {isInactive ? 'Inactive' : 'Active'}
                </Badge>
              </dd>

              <dt>Sign-in</dt>
              <dd>
                {user.isLocked ? (
                  <>
                    <Badge tone="warning">Locked</Badge>
                    <small className="table__sub">
                      Until {formatDateTime(user.lockedUntil)}, after {user.failedLoginAttempts}{' '}
                      failed attempts
                    </small>
                  </>
                ) : (
                  'Not locked'
                )}
              </dd>

              <dt>Password</dt>
              <dd>
                {user.mustChangePassword
                  ? 'Temporary — must be changed at next sign-in'
                  : 'Set by the user'}
              </dd>

              <dt>Last sign-in</dt>
              <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never signed in'}</dd>

              <dt>Created</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default UserDetail;
