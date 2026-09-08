import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { useAuth } from '../../auth/AuthContext';
import { CAPABILITIES, POLICY_CATEGORY_LABELS } from '../../constants';
import { fetchModules } from '../../api/training';
import { dueDescription } from '../../utils/format';

// One screen, two audiences - the shape PolicyList already uses.
//
// An admin sees every module including drafts, with its audience, and goes to
// the builder. Everybody else sees the published modules aimed at them, with
// their own progress, and goes to the player. WHICH modules come back is
// decided by the API from the caller's role and department; this screen does no
// filtering of its own, because anything it hid would still be reachable by
// calling the endpoint directly (NFR-SEC-03).
const ModuleList = () => {
  const { can } = useAuth();
  const isAuthor = can(CAPABILITIES.TRAINING_AUTHOR);

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

  if (!modules) return <Spinner label="Loading training…" />;

  const published = modules.filter((module) => module.status === 'PUBLISHED').length;
  const outstanding = modules.filter((module) => !module.task?.completedAt).length;

  const describeAudience = (module) => {
    if (!module.audience || module.audience.isEveryone) return 'Everyone';
    return [...module.audience.roles, ...module.audience.departments].join(', ').toLowerCase();
  };

  // --- The author's list ----------------------------------------------------

  if (isAuthor) {
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

        <div className="list-toolbar">
          <Link to="/training/modules/new" className="btn btn--primary btn--sm">
            + New module
          </Link>
        </div>

        {modules.length === 0 ? (
          <section className="card">
            <h2>No training modules yet.</h2>
            <p className="muted">
              A module is some short content — a walkthrough, a video — followed by a quiz.
              Publishing one assigns it to everybody it targets, and they complete it by passing the
              quiz.
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
                  </span>

                  <span className="policy-card__audience">{describeAudience(module)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // --- The learner's list ---------------------------------------------------

  return (
    <div className="page">
      <header className="page__header">
        <h1>Training</h1>
        <p>
          {modules.length === 0
            ? 'Nothing assigned to you yet.'
            : `${outstanding} of ${modules.length} still to complete.`}
        </p>
      </header>

      {modules.length === 0 ? (
        <section className="card">
          <h2>No training has been assigned to you yet.</h2>
          <p className="muted">
            When an administrator publishes a module that applies to your role or department, it
            will appear here with a date to finish it by.
          </p>
        </section>
      ) : (
        <ul className="task-list">
          {modules.map((module) => {
            const task = module.task || {};
            const passed = task.quiz?.passed;

            return (
              <li key={module.id}>
                <Link
                  className={`task-row${task.status === 'OVERDUE' ? ' task-row--overdue' : ''}`}
                  to={`/training/modules/${module.id}`}
                >
                  <span className="task-row__main">
                    <span className="task-row__title">{module.title}</span>
                    <span className="task-row__meta">
                      {module.questionCount} question{module.questionCount === 1 ? '' : 's'} ·{' '}
                      {passed
                        ? `Passed with ${task.quiz.bestScorePercent}%`
                        : dueDescription(task.dueDate)}
                    </span>
                    {!passed && (
                      <progress className="progress__bar" max="100" value={task.percentComplete}>
                        {task.percentComplete}%
                      </progress>
                    )}
                  </span>

                  <span className={`badge badge--${passed ? 'ok' : task.status === 'OVERDUE' ? 'danger' : 'warning'}`}>
                    {passed
                      ? 'complete'
                      : task.percentComplete === 100
                        ? 'quiz to take'
                        : `${task.percentComplete}%`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ModuleList;
