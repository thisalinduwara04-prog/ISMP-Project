import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Alert from '../components/Alert';
import Button from '../components/Button';
import Field from '../components/Field';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../constants';
import logo from '../assets/savikro.png';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const idleSignOut = location.state?.reason === 'idle';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { user } = await login(employeeId, password);

      // A temporary password must be replaced before anything else.
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }

      // Back to wherever they were headed, or their role's home (UC-02 step 8).
      const intended = location.state?.from?.pathname;
      navigate(intended || homePathFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-photo">
      <div className="auth-side">
        <div className="auth-panel__brand">
          <img src={logo} alt="" className="brand-logo" />
          <span>Savikro</span>
        </div>

        <form className="auth-panel" onSubmit={handleSubmit} noValidate>
          <div className="auth-panel__body">
            <h1 className="auth-card__title">Sign in</h1>
            <p className="auth-card__subtitle">Use the employee ID issued by your administrator.</p>

            {idleSignOut && !error && (
              <Alert tone="info" title="Signed out">
                You were signed out after 30 minutes of inactivity.
              </Alert>
            )}

            {error && (
              <Alert
                tone={error.code === 'ACCOUNT_LOCKED' ? 'warning' : 'error'}
                title={error.code === 'ACCOUNT_LOCKED' ? 'Account locked' : 'Could not sign in'}
              >
                {error.message}
              </Alert>
            )}

            <Field label="Employee ID" htmlFor="employeeId">
              <input
                id="employeeId"
                name="employeeId"
                className="field__input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                placeholder="SVK-020"
                required
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <input
                id="password"
                name="password"
                type="password"
                className="field__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <Button type="submit" block busy={submitting} busyLabel="Signing in…">
              Sign in
            </Button>
          </div>

          <p className="auth-panel__footnote">
            Forgotten your password? Contact your administrator for a reset.
          </p>
        </form>
      </div>

      {/* Decorative: painted in CSS so it can fade into the white panel. */}
      <div className="auth-photo__media" aria-hidden="true" />
    </div>
  );
};

export default Login;
