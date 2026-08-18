import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPolicy } from '../../api/policies';
import Alert from '../../components/Alert';
import { ALL_ROLES, ROLE_LABELS, ROLES } from '../../constants';

const TARGETABLE_ROLES = ALL_ROLES.filter((r) => r !== ROLES.ADMIN);

export default function PolicyForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    category: '',
    description: '',
    content: '',
    targetRoles: [],
    status: 'published',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleRole = (role) => {
    setForm((f) => ({
      ...f,
      targetRoles: f.targetRoles.includes(role)
        ? f.targetRoles.filter((r) => r !== role)
        : [...f.targetRoles, role],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const policy = await createPolicy(form);
      navigate(`/admin/policies/${policy._id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create policy.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>New Policy</h1>
      </div>

      <Alert type="error">{error}</Alert>

      <form className="card form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Title</span>
          <input value={form.title} onChange={update('title')} required />
        </label>

        <label className="field">
          <span>Category</span>
          <input value={form.category} onChange={update('category')} placeholder="e.g. Data Protection" required />
        </label>

        <label className="field">
          <span>Short description</span>
          <input value={form.description} onChange={update('description')} />
        </label>

        <label className="field">
          <span>Applies to (leave blank for all roles)</span>
          <div className="checkbox-row">
            {TARGETABLE_ROLES.map((r) => (
              <label key={r} className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={form.targetRoles.includes(r)}
                  onChange={() => toggleRole(r)}
                />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Policy content (version 1)</span>
          <textarea rows={8} value={form.content} onChange={update('content')} required minLength={10} />
        </label>

        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={update('status')}>
            <option value="draft">Draft (not visible to employees yet)</option>
            <option value="published">Published</option>
          </select>
        </label>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create policy'}
        </button>
      </form>
    </div>
  );
}
