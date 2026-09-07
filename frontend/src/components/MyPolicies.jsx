import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from './Alert';
import Spinner from './Spinner';
import TaskBadge from './TaskBadge';
import { fetchPolicies } from '../api/policies';
import { dueDescription } from '../utils/format';

// The caller's own outstanding policies.
//
// Shared between every role's landing page, because EVERY role has policies to
// read. A manager is an employee too - they have POLICY_VIEW_ASSIGNED and
// POLICY_ACKNOWLEDGE like anyone else - and leaving this off their dashboard
// made their own assigned policies unreachable in the interface even though
// the API was returning them.
//
// Shows only what is outstanding: an acknowledged policy leaves the list
// (UC-10 step 7) and stays available under Policies.
const MyPolicies = ({ heading = 'Policies to read' }) => {
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    fetchPolicies()
      .then((data) => {
        if (!active) return;
        setOutstanding(data.policies.filter((policy) => policy.task?.state !== 'ACKNOWLEDGED'));
      })
      .catch((loadError) => active && setError(loadError.message));

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <Alert tone="error" title="Could not load your policies">
        {error}
      </Alert>
    );
  }

  if (!outstanding) return <Spinner label="Loading your policies…" />;

  if (outstanding.length === 0) {
    return (
      <section className="card">
        <h2>Nothing outstanding</h2>
        <p className="muted">
          You are up to date. Policies to read will appear here when an administrator publishes one
          that applies to you.
        </p>
        <p>
          <Link to="/policies" className="btn btn--ghost btn--sm">
            View all policies
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>
        {outstanding.length} {heading.toLowerCase()}
      </h2>
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
      <p className="list-footer">
        <Link to="/policies" className="btn btn--ghost btn--sm">
          View all policies
        </Link>
      </p>
    </section>
  );
};

export default MyPolicies;
