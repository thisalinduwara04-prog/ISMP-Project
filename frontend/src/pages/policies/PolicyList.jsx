import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import TaskBadge from '../../components/TaskBadge';
import { useAuth } from '../../auth/AuthContext';
import { CAPABILITIES } from '../../constants';
import { fetchAllPolicies } from '../../api/policies';
import { formatDate, dueDescription } from '../../utils/format';

// UC-09 / US-013. The list is already filtered and already sorted by the API -
// overdue first - so this screen does no filtering of its own. Anything it
// hid would still be reachable by calling the endpoint directly, which is why
// the rule lives on the server (NFR-SEC-03).
//
// An admin sees every policy with its audience, and goes to the detail screen.
// Everyone else sees their own assigned policies, and goes to the reader.
const PolicyList = () => {
  const { can } = useAuth();
  const isAuthor = can(CAPABILITIES.POLICY_AUTHOR);

  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The flag is sent to the API rather than filtered here: an archived
      // policy is not in the response at all unless it was asked for.
      // Employees never receive them whatever this says.
      const data = await fetchAllPolicies(isAuthor && includeArchived);
      setPolicies(data.policies);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [isAuthor, includeArchived]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Policies</h1>
        </header>
        <Alert tone="error" title="Could not load policies">
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  if (!policies) return <Spinner label="Loading policies…" />;

  const outstanding = policies.filter((policy) => policy.task?.state !== 'ACKNOWLEDGED').length;

  const archivedShown = policies.filter((policy) => policy.status === 'ARCHIVED').length;

  const renderRow = (policy) => {
    const state = policy.task?.state || 'NOT_ASSIGNED';
    const done = state === 'ACKNOWLEDGED';

    const audience =
      isAuthor && policy.audience
        ? policy.audience.isEveryone
          ? 'Everyone'
          : [...policy.audience.roles, ...policy.audience.departments].join(', ').toLowerCase()
        : null;

    return (
      <li key={policy.id}>
        <Link
          className={`policy-card${state === 'OVERDUE' ? ' policy-card--overdue' : ''}`}
          to={
            isAuthor
              ? `/policies/${policy.id}`
              : `/policies/${policy.id}/versions/${policy.currentVersion.id}`
          }
        >
          {/* Badge on its own line above the title, so a long policy name has
              the full width of the card and never collides with it. */}
          <span className="policy-card__head">
            <span className="policy-card__code">{policy.code}</span>
            {isAuthor ? (
              <span className={`badge badge--${policy.status === 'ARCHIVED' ? 'neutral' : 'ok'}`}>
                {policy.status.toLowerCase()}
              </span>
            ) : (
              <TaskBadge state={state} />
            )}
          </span>

          <span className="policy-card__title">{policy.title}</span>

          <span className="policy-card__meta">
            {policy.currentVersion
              ? `Version ${policy.currentVersion.versionNumber}`
              : 'No published version'}
            {!isAuthor &&
              (done
                ? ` · Acknowledged ${formatDate(policy.task.completedAt)}`
                : ` · ${dueDescription(policy.task?.dueDate)}`)}
          </span>

          {audience && <span className="policy-card__audience">{audience}</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>{isAuthor ? 'All policies' : 'Policies'}</h1>
        <p>
          {isAuthor
            ? `${policies.length - archivedShown} in force${
                archivedShown ? `, ${archivedShown} archived` : ''
              }.`
            : policies.length === 0
              ? 'Nothing assigned to you yet.'
              : `${outstanding} of ${policies.length} still to read.`}
        </p>
      </header>

      {isAuthor && (
        <div className="list-toolbar">
          <Link to="/policies/new" className="btn btn--primary btn--sm">
            + New policy
          </Link>
        </div>
      )}

      {policies.length === 0 ? (
        <section className="card">
          <h2>
            {isAuthor
              ? 'No policies yet.'
              : 'No policies have been assigned to you yet.'}
          </h2>
          <p className="muted">
            {isAuthor
              ? 'Policies published here will appear on the task lists of the staff they target.'
              : 'When an administrator publishes a policy that applies to your role or department, it will appear here and you will be asked to confirm you have read it.'}
          </p>
        </section>
      ) : (
        <ul className="policy-grid">{policies.map(renderRow)}</ul>
      )}

      {/* Below the list: retired policies are a footnote to what is in force,
          not a filter you have to deal with before reading the page. */}
      {isAuthor && (
        <div className="list-footer">
          <label className="checkbox checkbox--inline" htmlFor="include-archived">
            <input
              id="include-archived"
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            <span>Include archived</span>
          </label>
        </div>
      )}
    </div>
  );
};

export default PolicyList;
