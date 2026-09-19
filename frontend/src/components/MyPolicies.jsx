import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import EmptyState from './EmptyState';
import TaskBadge from './TaskBadge';
import Widget from './Widget';
import { fetchPolicies } from '../api/policies';
import { dueDescription } from '../utils/format';

// The caller's own outstanding policies, as a dashboard widget.
//
// Shared between every role's landing page, because EVERY role has policies to
// read. A manager is an employee too - they have POLICY_VIEW_ASSIGNED and
// POLICY_ACKNOWLEDGE like anyone else - and leaving this off their dashboard
// made their own assigned policies unreachable in the interface even though
// the API was returning them.
//
// Shows only what is outstanding: an acknowledged policy leaves the list
// (UC-10 step 7) and stays available under Policies. Overdue ones come first,
// because they are the ones that need doing today.
const MyPolicies = ({ span = 'half' }) => {
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    fetchPolicies()
      .then((data) => {
        if (!active) return;
        const open = data.policies.filter((policy) => policy.task?.state !== 'ACKNOWLEDGED');
        open.sort((a, b) => (b.task?.state === 'OVERDUE') - (a.task?.state === 'OVERDUE'));
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
      title="Policies to read"
      subtitle={outstanding ? `${count} outstanding` : null}
      span={span}
      loading={!outstanding && !error}
      loadingLabel="Loading your policies…"
      error={error && `Could not load your policies. ${error}`}
      footer={(
        <Link to="/policies" className="btn btn--ghost btn--sm">
          View all policies
        </Link>
      )}
    >
      {count === 0 ? (
        <EmptyState
          title="Nothing outstanding"
          body="You are up to date. New policies appear here when one is published that applies to you."
        />
      ) : (
        <ul className="task-list">
          {outstanding.map((policy) => (
            <li key={policy.id}>
              <Link
                className={`task-row${policy.task?.state === 'OVERDUE' ? ' task-row--overdue' : ''}`}
                to={`/policies/${policy.id}/versions/${policy.currentVersion.id}`}
              >
                <span className="task-row__main">
                  <span className="task-row__title">{policy.title}</span>
                  <span className="task-row__meta">
                    {policy.code} · {dueDescription(policy.task?.dueDate)}
                  </span>
                </span>
                <TaskBadge state={policy.task?.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
};

export default MyPolicies;
