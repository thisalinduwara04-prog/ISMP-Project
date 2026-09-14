import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from './Alert';
import Spinner from './Spinner';
import { fetchModules } from '../api/training';
import { dueDescription } from '../utils/format';

// The caller's own outstanding training, for the landing pages. The sibling of
// MyPolicies, and shown to every role for the same reason: a manager is an
// employee too, and their own assigned training is theirs to complete.
//
// Only what is outstanding. A module whose quiz has been passed leaves the list
// and stays available under Training, where the score and every attempt remain
// on the record.
const MyTraining = () => {
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    fetchModules()
      .then((data) => {
        if (!active) return;
        setOutstanding(data.modules.filter((module) => !module.task?.quiz?.passed));
      })
      .catch((loadError) => active && setError(loadError.message));

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <Alert tone="error" title="Could not load your training">
        {error}
      </Alert>
    );
  }

  if (!outstanding) return <Spinner label="Loading your training…" />;

  if (outstanding.length === 0) {
    return (
      <section className="card">
        <h2>No training outstanding</h2>
        <p className="muted">
          Modules assigned to you will appear here. You complete one by working through its sections
          and passing the quiz at the end.
        </p>
        <p>
          <Link to="/training" className="btn btn--ghost btn--sm">
            View all training
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>{outstanding.length} training to complete</h2>
      <ul className="task-list">
        {outstanding.map((module) => {
          const task = module.task || {};

          return (
            <li key={module.id}>
              <Link
                className={`task-row${task.status === 'OVERDUE' ? ' task-row--overdue' : ''}`}
                to={`/training/modules/${module.id}`}
              >
                <span className="task-row__main">
                  <span className="task-row__title">{module.title}</span>
                  <span className="task-row__meta">
                    {task.percentComplete === 100
                      ? 'Content finished — the quiz is unlocked'
                      : `${task.itemsCompleted || 0} of ${task.itemsTotal} sections`}{' '}
                    · {dueDescription(task.dueDate)}
                  </span>
                  <progress className="progress__bar" max="100" value={task.percentComplete || 0}>
                    {task.percentComplete || 0}%
                  </progress>
                </span>
                <span
                  className={`badge badge--${task.status === 'OVERDUE' ? 'danger' : 'warning'}`}
                >
                  {task.percentComplete === 100 ? 'quiz to take' : `${task.percentComplete || 0}%`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="list-footer">
        <Link to="/training" className="btn btn--ghost btn--sm">
          View all training
        </Link>
      </p>
    </section>
  );
};

export default MyTraining;
