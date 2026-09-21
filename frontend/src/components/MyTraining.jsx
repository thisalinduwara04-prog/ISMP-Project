import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import EmptyState from './EmptyState';
import Widget from './Widget';
import { fetchModules } from '../api/training';
import { dueDescription } from '../utils/format';

// The caller's own outstanding training, as a dashboard widget. The sibling of
// MyPolicies, and shown to every role for the same reason: a manager is an
// employee too, and their own assigned training is theirs to complete.
//
// Only what is outstanding. A module whose quiz has been passed leaves the list
// and stays available under Training, where the score and every attempt remain
// on the record.
const MyTraining = ({ span = 'half' }) => {
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    fetchModules()
      .then((data) => {
        if (!active) return;
        const open = data.modules.filter((module) => !module.task?.quiz?.passed);
        open.sort((a, b) => (b.task?.status === 'OVERDUE') - (a.task?.status === 'OVERDUE'));
        setOutstanding(open);
      })
      .catch((loadError) => active && setError(loadError.message));

    return () => {
      active = false;
    };
  }, []);

  const count = outstanding?.length || 0;

  return (
    <Widget
      title="Training to complete"
      subtitle={outstanding ? `${count} outstanding` : null}
      span={span}
      loading={!outstanding && !error}
      loadingLabel="Loading your training…"
      error={error && `Could not load your training. ${error}`}
      footer={(
        <Link to="/training" className="btn btn--ghost btn--sm">
          View all training
        </Link>
      )}
    >
      {count === 0 ? (
        <EmptyState
          title="No training outstanding"
          body="Modules assigned to you appear here. You complete one by working through it and passing the quiz."
        />
      ) : (
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
                    {task.status === 'OVERDUE'
                      ? 'Overdue'
                      : task.percentComplete === 100
                        ? 'Quiz to take'
                        : `${task.percentComplete || 0}%`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
};

export default MyTraining;
