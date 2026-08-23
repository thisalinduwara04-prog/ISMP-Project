import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Alert from '../components/Alert';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../constants';

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
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
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

        <label className="field" htmlFor="employeeId">
          <span className="field__label">Employee ID</span>
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
        </label>

        <label className="field" htmlFor="password">
          <span className="field__label">Password</span>
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
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-card__footnote">
          Forgotten your password? Contact your administrator for a reset.
        </p>
      </form>
    </div>
  );
};

export default Login;
