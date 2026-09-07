import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../../components/Alert';
import ComplianceSummary from '../../components/ComplianceSummary';
import Spinner from '../../components/Spinner';
import { useAuth } from '../../auth/AuthContext';
import { getMyCompliance } from '../../api/compliance';
import { fetchPolicies } from '../../api/policies';
import { DEPARTMENT_LABELS } from '../../constants';

const MyTasks = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([getMyCompliance(), fetchPolicies()]).then(([complianceResult, policyResult]) => {
      if (!active) return;
      if (complianceResult.status === 'rejected') {
        setError(complianceResult.reason.message);
        return;
      }
      setData(complianceResult.value);
      if (policyResult.status === 'fulfilled') setPolicies(policyResult.value.policies || []);
    });
    return () => { active = false; };
  }, []);

  const policyByVersion = useMemo(() => new Map(
    policies
      .filter((policy) => policy.currentVersion)
      .map((policy) => [policy.currentVersion.id, policy])
  ), [policies]);

  if (!data && !error) return <Spinner label="Loading your compliance tasks…" />;

  return (
    <div className="page">
      <header className="page__header">
        <h1>My tasks</h1>
        <p>{user.fullName} · {DEPARTMENT_LABELS[user.department]}</p>
      </header>

      {error && <Alert tone="error" title="Tasks unavailable">{error}</Alert>}
      {data && data.summary.total === 0 ? (
        <section className="card">
          <h2>Nothing assigned yet</h2>
          <p className="muted">Policies and training will appear here when they are assigned.</p>
          <Link to="/policies" className="btn btn--ghost btn--sm">View policies</Link>
        </section>
      ) : data && (
        <>
          <ComplianceSummary summary={data.summary} />
          <section className="card">
            <div className="section-heading">
              <div><h2>Your assignments</h2><p className="muted">Complete overdue and upcoming work from one list.</p></div>
              <Link to="/policies" className="btn btn--ghost btn--sm">All policies</Link>
            </div>
            <div className="task-list">
              {data.assignments.map((assignment) => {
                const policy = assignment.itemType === 'POLICY'
                  ? policyByVersion.get(String(assignment.itemId))
                  : null;
                return (
                  <article className="task" key={assignment._id}>
                    <div>
                      <span className={`status status--${assignment.status.toLowerCase()}`}>
                        {assignment.status.replaceAll('_', ' ')}
                      </span>
                      <h3>{assignment.itemTitle}</h3>
                      <p className="muted">{assignment.itemType === 'POLICY' ? 'Policy acknowledgement' : 'Training module'}</p>
                      {policy && (
                        <Link className="btn btn--primary btn--sm" to={`/policies/${policy.id}/versions/${policy.currentVersion.id}`}>
                          Read policy
                        </Link>
                      )}
                    </div>
                    <div className="task__due"><span>Due</span><strong>{new Date(assignment.dueDate).toLocaleDateString()}</strong></div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MyTasks;
