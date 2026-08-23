import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Alert from '../components/Alert';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../constants';

// Mirrors the server-side policy in backend/src/modules/auth/password.service.js.
// Shown live as the user types so the rules are visible before submitting; the
// server remains the authority.
const RULES = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
  { label: 'A special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const ChangePassword = () => {
  const { changePassword, mustChangePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const ruleResults = RULES.map((rule) => ({ ...rule, met: rule.test(newPassword) }));
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit = ruleResults.every((r) => r.met) && !mismatch && currentPassword.length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { user: updated } = await changePassword(currentPassword, newPassword);
      navigate(homePathFor(updated), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-card__title">
          {mustChangePassword ? 'Choose a new password' : 'Change your password'}
        </h1>

        {mustChangePassword && (
          <Alert tone="info" title="A new password is required">
            Your account is using a temporary password issued by an administrator. Choose your own
            before continuing.
          </Alert>
        )}

        {error && (
          <Alert title="Could not change your password">
            {error.message}
            {error.details?.length > 0 && (
              <ul className="alert__list">
                {error.details.map((detail) => (
                  <li key={`${detail.field}-${detail.issue}`}>{detail.issue}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <label className="field" htmlFor="currentPassword">
          <span className="field__label">
            {mustChangePassword ? 'Temporary password' : 'Current password'}
          </span>
          <input
            id="currentPassword"
            type="password"
            className="field__input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="field" htmlFor="newPassword">
          <span className="field__label">New password</span>
          <input
            id="newPassword"
            type="password"
            className="field__input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <ul className="rules" aria-label="Password requirements">
          {ruleResults.map((rule) => (
            <li
              key={rule.label}
              className={rule.met ? 'rules__item rules__item--met' : 'rules__item'}
            >
              <span aria-hidden="true">{rule.met ? '✓' : '○'}</span> {rule.label}
            </li>
          ))}
        </ul>

        <label className="field" htmlFor="confirmPassword">
          <span className="field__label">Confirm new password</span>
          <input
            id="confirmPassword"
            type="password"
            className="field__input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch}
            required
          />
          {mismatch && <span className="field__error">Both passwords must match.</span>}
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={!canSubmit || submitting}
        >
          {submitting ? 'Saving…' : 'Update password'}
        </button>

        <p className="auth-card__footnote">
          Changing your password signs you out on every other device.
        </p>
      </form>
    </div>
  );
};

export default ChangePassword;
