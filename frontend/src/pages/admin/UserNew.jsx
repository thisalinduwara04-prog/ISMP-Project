import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Alert from '../../components/Alert';
import CredentialPanel from '../../components/CredentialPanel';
import { createUser } from '../../api/users';
import { DEPARTMENT_LABELS, ROLE_LABELS } from '../../constants';

// UC-01. Two screens in one component, because the second is the whole point of
// the first: on success the form is REPLACED by the credential panel rather
// than navigating away, since the temporary password is returned once and is
// unrecoverable after this render.

const BLANK = {
  employeeId: '',
  fullName: '',
  email: '',
  department: 'SALES',
  role: 'EMPLOYEE',
  jobTitle: '',
};

const UserNew = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  // A mirror of the server's rules, not a substitute for them - the API
  // validates the same things and is the authority.
  const canSubmit =
    form.employeeId.trim().length >= 3 &&
    form.fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // No password field is sent. The server generates the temporary one, so
      // there is no path by which an admin can set a password they know and
      // keep using (NFR-SEC-02).
      const data = await createUser({
        employeeId: form.employeeId.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        department: form.department,
        role: form.role,
        ...(form.jobTitle.trim() ? { jobTitle: form.jobTitle.trim() } : {}),
      });

      setCreated(data);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="page page--narrow">
        <header className="page__header">
          <h1>Account created</h1>
          <p>
            One more step: hand the password below to the new starter.
            {created.assignmentsAssigned > 0 && (
              <>
                {' '}
                They have been given {created.assignmentsAssigned} outstanding{' '}
                {created.assignmentsAssigned === 1 ? 'item' : 'items'} already published to their
                department and role.
              </>
            )}
          </p>
        </header>

        <CredentialPanel user={created.user} temporaryPassword={created.temporaryPassword}>
          <div className="confirm-actions">
            <Link to={`/admin/users/${created.user.id}`} className="btn btn--primary btn--sm">
              Open account
            </Link>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setCreated(null);
                setForm(BLANK);
              }}
            >
              Create another
            </button>
            <Link to="/admin/users" className="btn btn--ghost btn--sm">
              Done
            </Link>
          </div>
        </CredentialPanel>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <header className="page__header">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => navigate('/admin/users')}
        >
          ← All accounts
        </button>
        <h1>New user account</h1>
        <p>
          The system issues a temporary password. You will see it once, on the next screen, to pass
          on to the employee.
        </p>
      </header>

      <form className="card" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert title="Could not create this account">
            {error.message}
            {error.details?.length > 0 && (
              <ul className="alert__list">
                {error.details.map((detail) => (
                  <li key={`${detail.field}-${detail.issue}`}>
                    {detail.field}: {detail.issue}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <label className="field" htmlFor="employeeId">
          <span className="field__label">Employee ID</span>
          <input
            id="employeeId"
            className="field__input"
            value={form.employeeId}
            onChange={set('employeeId')}
            placeholder="SVK-014"
            aria-describedby="employeeId-help"
            required
          />
          <small id="employeeId-help" className="field__help">
            What this person signs in with. Letters, digits and hyphens; stored in capitals.
          </small>
        </label>

        <label className="field" htmlFor="fullName">
          <span className="field__label">Full name</span>
          <input
            id="fullName"
            className="field__input"
            value={form.fullName}
            onChange={set('fullName')}
            required
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
            required
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
            Decides which policies and training this person is given.
          </small>
        </label>

        <label className="field" htmlFor="role">
          <span className="field__label">Role</span>
          <select
            id="role"
            className="field__input"
            value={form.role}
            onChange={set('role')}
            aria-describedby="role-help"
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small id="role-help" className="field__help">
            Decides what this person may do. Managers see their department&apos;s compliance;
            administrators manage the whole platform.
          </small>
        </label>

        <label className="field" htmlFor="jobTitle">
          <span className="field__label">Job title (optional)</span>
          <input
            id="jobTitle"
            className="field__input"
            value={form.jobTitle}
            onChange={set('jobTitle')}
            placeholder="Warehouse Supervisor"
          />
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={!canSubmit || submitting}
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </div>
  );
};

export default UserNew;
