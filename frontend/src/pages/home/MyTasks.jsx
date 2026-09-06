import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import TaskBadge from '../../components/TaskBadge';
import { useAuth } from '../../auth/AuthContext';
import { fetchPolicies } from '../../api/policies';
import { DEPARTMENT_LABELS } from '../../constants';
import { dueDescription } from '../../utils/format';

// Landing page for EMPLOYEE (UC-02 step 8). Policies land here with M2;
// training and the personal compliance percentage arrive with M3 and M4.
//
// It shows only what is still OUTSTANDING. An acknowledged policy leaves this
// list - that is UC-10 step 7 - and stays available under Policies.
const MyTasks = () => {
  const { user, capabilities } = useAuth();
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPolicies()
      .then((data) =>
        setOutstanding(data.policies.filter((policy) => policy.task?.state !== 'ACKNOWLEDGED'))
      )
      .catch((loadError) => setError(loadError.message));
  }, []);

  return (
    <div className="page">
      <header className="page__header">
        <h1>My tasks</h1>
        <p>
          {user.fullName} · {DEPARTMENT_LABELS[user.department]}
        </p>
      </header>

      {error && (
        <Alert tone="error" title="Could not load your tasks">
          {error}
        </Alert>
      )}

      {!outstanding && !error && <Spinner label="Loading your tasks…" />}

      {outstanding && outstanding.length === 0 && (
        <section className="card">
          <h2>Nothing outstanding</h2>
          <p className="muted">
            You are up to date. Policies to read and training to complete will appear here when an
            administrator publishes them.
          </p>
          <p>
            <Link to="/policies" className="btn btn--ghost btn--sm">
              View all policies
            </Link>
          </p>
        </section>
      )}

      {outstanding && outstanding.length > 0 && (
        <section>
          <h2>
            {outstanding.length} polic{outstanding.length === 1 ? 'y' : 'ies'} to read
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
        </section>
      )}

      <section className="card">
        <h2>What this account can do</h2>
        <p className="muted">
          Granted by the server for the {user.role} role, and re-checked on every request.
        </p>
        <ul className="chips">
          {capabilities.map((capability) => (
            <li key={capability} className="chip">
              {capability.replaceAll('_', ' ').toLowerCase()}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default MyTasks;
