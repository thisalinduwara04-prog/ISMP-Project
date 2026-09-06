import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Alert from '../../components/Alert';
import { createPolicy } from '../../api/policies';
import { POLICY_CATEGORY_LABELS } from '../../constants';

// Step 1 of 3: the policy SHELL - the record that persists across every future
// revision. It carries no wording and assigns nothing to anybody; that comes
// with the draft and the publish that follow.
const PolicyNew = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    code: '',
    category: 'GENERAL',
    description: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const canSubmit = form.title.trim().length >= 3 && form.code.trim().length >= 3;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await createPolicy({
        title: form.title.trim(),
        code: form.code.trim().toUpperCase(),
        category: form.category,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });

      // Straight into writing version 1 - a shell with no version is of no use
      // to anyone, so the flow does not stop here.
      navigate(`/policies/${data.policy.id}/versions/new`, { replace: true });
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__header">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/policies')}>
          ← All policies
        </button>
        <h1><br></br>Add New Policy</h1>
        <p>Step 1 of 3 — the record. You will write version 1 next, then publish it.</p>
      </header>

      <form className="card" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert title="Could not create this policy">
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

        <label className="field" htmlFor="title">
          <span className="field__label">Title</span>
          <input
            id="title"
            className="field__input"
            value={form.title}
            onChange={set('title')}
            placeholder="Acceptable Use Policy"
            required
          />
        </label>

        <label className="field" htmlFor="code">
          <span className="field__label">Code</span>
          <input
            id="code"
            className="field__input"
            value={form.code}
            onChange={set('code')}
            placeholder="POL-AUP-001"
            aria-describedby="code-help"
            required
          />
          <small id="code-help" className="field__help">
            Unique, and fixed for the life of the policy — it is how this policy is identified
            across every revision. Letters, digits and hyphens.
          </small>
        </label>

        <label className="field" htmlFor="category">
          <span className="field__label">Category</span>
          <select id="category" className="field__input" value={form.category} onChange={set('category')}>
            {Object.entries(POLICY_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field" htmlFor="description">
          <span className="field__label">Short description</span>
          <input
            id="description"
            className="field__input"
            value={form.description}
            onChange={set('description')}
            placeholder="One line, shown in listings."
          />
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit || submitting}>
          {submitting ? 'Creating…' : 'Create and write version 1'}
        </button>
      </form>
    </div>
  );
};

export default PolicyNew;
