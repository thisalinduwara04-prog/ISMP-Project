import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { fetchModules } from '../../api/training';
import { POLICY_CATEGORY_LABELS } from '../../constants';

// The author's list of training modules (UC-13). Drafts and published modules
// together, because half the job is remembering what has not gone out yet.
//
// The employee-facing list - the one that carries progress and a due date -
// lands with the module player in M3-T4. This screen is reached only through
// the TRAINING_AUTHOR guard.
const ModuleList = () => {
  // The builder unmounts as it navigates here, so it hands the result of a
  // publication over in the navigation state rather than showing it itself.
  const { state } = useLocation();

  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchModules();
      setModules(data.modules);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Training</h1>
        </header>
        <Alert tone="error" title="Could not load training modules">
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  if (!modules) return <Spinner label="Loading training modules…" />;

  const published = modules.filter((module) => module.status === 'PUBLISHED').length;

  const describeAudience = (module) => {
    if (!module.audience || module.audience.isEveryone) return 'Everyone';
    return [...module.audience.roles, ...module.audience.departments].join(', ').toLowerCase();
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Training modules</h1>
        <p>
          {modules.length === 0
            ? 'Nothing built yet.'
            : `${published} published, ${modules.length - published} in draft.`}
        </p>
      </header>

      {state?.notice && <Alert tone="success">{state.notice}</Alert>}

      <div className="list-toolbar">
        <Link to="/training/modules/new" className="btn btn--primary btn--sm">
          + New module
        </Link>
      </div>

      {modules.length === 0 ? (
        <section className="card">
          <h2>No training modules yet.</h2>
          <p className="muted">
            A module is some short content — a walkthrough, a video — followed by a quiz. Publishing
            one assigns it to everybody it targets, and they complete it by passing the quiz.
          </p>
        </section>
      ) : (
        <ul className="policy-grid">
          {modules.map((module) => (
            <li key={module.id}>
              <Link className="policy-card" to={`/training/modules/${module.id}/edit`}>
                <span className="policy-card__head">
                  <span className="policy-card__code">{module.code}</span>
                  <span
                    className={`badge badge--${module.status === 'PUBLISHED' ? 'ok' : 'neutral'}`}
                  >
                    {module.status.toLowerCase()}
                  </span>
                </span>

                <span className="policy-card__title">{module.title}</span>

                <span className="policy-card__meta">
                  {POLICY_CATEGORY_LABELS[module.category] || module.category} ·{' '}
                  {module.contentItemCount} item{module.contentItemCount === 1 ? '' : 's'} ·{' '}
                  {module.questionCount} question{module.questionCount === 1 ? '' : 's'}
                  {module.estimatedMinutes ? ` · ${module.estimatedMinutes} min` : ''}
                </span>

                <span className="policy-card__audience">{describeAudience(module)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ModuleList;
