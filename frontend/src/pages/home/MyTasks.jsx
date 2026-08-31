import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';
import { getMyCompliance } from '../../api/compliance';
import ComplianceSummary from '../../components/ComplianceSummary';
import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';

// Landing page for EMPLOYEE (UC-02 step 8). The task list itself arrives with
// M2-M4; this slice delivers the authenticated shell it will live in.
const MyTasks = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMyCompliance()
      .then((value) => { if (active) setData(value); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, []);

  if (!data && !error) return <Spinner label="Loading your compliance tasks" />;

  return (
    <div className="page">
      <header className="page__header">
        <h1>My tasks</h1>
        <p>
          {user.fullName} · {DEPARTMENT_LABELS[user.department]}
        </p>
      </header>

      {error && <Alert title="Tasks unavailable">{error}</Alert>}
      {data && data.summary.total === 0 ? (
        <section className="card"><h2>Nothing assigned yet</h2><p className="muted">Policies and training will appear here when they are assigned.</p></section>
      ) : data && (
        <>
          <ComplianceSummary summary={data.summary} />
          <section className="card">
            <h2>Your assignments</h2>
            <div className="task-list">
              {data.assignments.map((assignment) => (
                <article className="task" key={assignment._id}>
                  <div><span className={`status status--${assignment.status.toLowerCase()}`}>{assignment.status.replaceAll('_', ' ')}</span><h3>{assignment.itemTitle}</h3><p className="muted">{assignment.itemType === 'POLICY' ? 'Policy acknowledgement' : 'Training module'}</p></div>
                  <div className="task__due"><span>Due</span><strong>{new Date(assignment.dueDate).toLocaleDateString()}</strong></div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MyTasks;
