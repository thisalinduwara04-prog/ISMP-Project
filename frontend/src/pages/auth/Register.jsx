import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Alert from '../../components/Alert';
import { ALL_ROLES, ROLE_LABELS, ROLES } from '../../constants';

const REGISTRABLE_ROLES = ALL_ROLES.filter((r) => r !== ROLES.ADMIN);

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    email: '',
    department: REGISTRABLE_ROLES[0],
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <span className="brand-mark">SV</span>
          <h1>Create your account</h1>
          <p>Register to access Savikro's security policies &amp; training</p>
        </div>

        <Alert type="error">{error}</Alert>

        <label className="field">
          <span>Full name</span>
          <input value={form.name} onChange={update('name')} required />
        </label>

        <label className="field">
          <span>Employee ID</span>
          <input value={form.employeeId} onChange={update('employeeId')} placeholder="e.g. SAL002" required />
        </label>

        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>

        <label className="field">
          <span>Department</span>
          <select value={form.department} onChange={update('department')} required>
            {REGISTRABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            required
          />
        </label>

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-footer">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
