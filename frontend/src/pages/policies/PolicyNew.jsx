import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Alert from '../../components/Alert';
import { createPolicy, fetchAllPolicies } from '../../api/policies';
import { POLICY_CATEGORY_LABELS, POLICY_CODE_PREFIX } from '../../constants';

// Step 1 of 3: the policy SHELL - the record that persists across every future
// revision. It carries no wording and assigns nothing to anybody; that comes
// with the draft and the publish that follow.
const PolicyNew = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    category: 'GENERAL',
    description: '',
  });
  const [takenCodes, setTakenCodes] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const canSubmit = form.title.trim().length >= 3;

  // Archived policies are included deliberately: they still hold their codes,
  // so skipping them would preview a number the server will refuse.
  useEffect(() => {
    let active = true;

    fetchAllPolicies(true)
      .then((data) => active && setTakenCodes(new Set(data.policies.map((policy) => policy.code))))
      .catch(() => active && setTakenCodes(new Set()));

    return () => {
      active = false;
    };
  }, []);

  // The same rule the server applies: first free sequence number for this
  // category's prefix. Shown so the admin knows what the policy will be called
  // before creating it; the server still assigns the real one.
  const previewCode = useMemo(() => {
    const prefix = POLICY_CODE_PREFIX[form.category] || 'POL-GEN';
    if (!takenCodes) return `${prefix}-…`;

    for (let sequence = 1; sequence <= 999; sequence += 1) {
      const candidate = `${prefix}-${String(sequence).padStart(3, '0')}`;
      if (!takenCodes.has(candidate)) return candidate;
    }
    return `${prefix}-…`;
  }, [form.category, takenCodes]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // `code` is deliberately not sent. The server derives it from the
      // category and the next free sequence number, so every policy is named
      // consistently and nobody has to invent a unique identifier that then
      // has to stay fixed for the life of the policy.
      const data = await createPolicy({
        title: form.title.trim(),
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

        {/* Read-only: the code is derived from the category and the next free
            number. Shown rather than hidden because it is how this policy will
            be referred to in every report and acknowledgement record from now
            on, and it cannot be changed afterwards. */}
        <label className="field" htmlFor="code">
          <span className="field__label">Code</span>
          <input
            id="code"
            className="field__input field__input--readonly"
            value={previewCode}
            readOnly
            aria-describedby="code-help"
          />
          <small id="code-help" className="field__help">
            Assigned automatically from the category below. Fixed for the life of the policy,
            because acknowledgement records and reports refer to it.
          </small>
        </label>

        <label className="field" htmlFor="category">
          <span className="field__label">Category</span>
          <select
            id="category"
            className="field__input"
            value={form.category}
            onChange={set('category')}
          >
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
