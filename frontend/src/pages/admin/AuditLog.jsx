import { useEffect, useState } from 'react';

import Alert from '../../components/Alert';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { fetchAuditFilters, fetchAuditLogs } from '../../api/audit';
import { formatDateTime } from '../../utils/format';
import { downloadXlsx } from '../../utils/xlsx';

// The security log (spec section 8.7). Read only, because the collection is
// append-only - there is no control on this screen that changes anything.
//
// The filter options come from the server's survey of the data, never from a
// list hard-coded here. Parts of the system built separately write their own
// action names into the same log, and a hard-coded list would quietly hide
// them from the only screen able to show them.

const BLANK_FILTERS = { from: '', to: '', action: '', outcome: '', actorId: '' };

const OUTCOMES = [
  { value: 'SUCCESS', label: 'Success', tone: 'ok' },
  { value: 'FAILURE', label: 'Failure', tone: 'warning' },
  { value: 'DENIED', label: 'Denied', tone: 'danger' },
];

const outcomeTone = (outcome) =>
  (OUTCOMES.find((o) => o.value === outcome) || { tone: 'neutral' }).tone;

const outcomeLabel = (outcome) =>
  (OUTCOMES.find((o) => o.value === outcome) || { label: outcome }).label;

// "POLICY_VERSION_DELETED" reads badly in a table. The raw string is still
// shown in the expanded detail, because that is what an auditor quotes.
const humanise = (value) =>
  typeof value === 'string' ? value.replaceAll('_', ' ').toLowerCase() : value;

// Metadata shape varies per action, and USER_UPDATED carries a nested
// `changes: { field: { from, to } }`. Scalars render as themselves; anything
// structured falls back to JSON so it is never printed as [object Object].
const renderValue = (value) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
};

const AuditLog = () => {
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState({ actions: [], actors: [] });
  const [expandedId, setExpandedId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = () => setReloadKey((current) => current + 1);

  const setFilter = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
    setPage(1);
    setExpandedId(null);
  };

  // Fetched once. The option lists change only when new kinds of event start
  // being recorded, which is a deployment, not a page view.
  useEffect(() => {
    let active = true;

    fetchAuditFilters()
      .then((result) => active && setOptions(result))
      // A failure here costs the dropdowns, not the log. The table is still
      // usable with the remaining filters, so it is not worth an error screen.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);

    // Empty strings are stripped rather than sent: the query schema is strict
    // and `outcome=''` is not one of its values.
    const params = Object.fromEntries(
      Object.entries({ ...filters, page }).filter(([, value]) => value !== '')
    );

    fetchAuditLogs(params)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });

    return () => {
      active = false;
    };
  }, [filters, page, reloadKey]);

  const header = (
    <header className="page__header">
      <h1>Audit log</h1>
      <p>
        Every security-relevant action, with who did it and what happened. Entries are written once
        and can never be edited or deleted.
      </p>
    </header>
  );

  if (error) {
    return (
      <div className="page">
        {header}
        <Alert tone="error" title="Could not load the audit log">
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={retry}>
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  const { entries, pagination } = data || {};

  const exportPage = () => {
    downloadXlsx(
      [
        ['Timestamp', 'Actor', 'Employee ID', 'Role', 'Action', 'Outcome', 'Entity', 'IP address', 'Details'],
        ...entries.map((entry) => [
          new Date(entry.timestamp).toISOString(),
          entry.actor ? entry.actor.fullName : '(account removed)',
          entry.actor ? entry.actor.employeeId : null,
          entry.actorRole,
          entry.action,
          entry.outcome,
          entry.entityType,
          entry.ipAddress,
          // One column of JSON: the shape differs per action, so a column per
          // key would be mostly empty and would change as new actions land.
          Object.keys(entry.metadata).length ? JSON.stringify(entry.metadata) : null,
        ]),
      ],
      `audit-log-page-${pagination.page}.xlsx`,
      'Audit log'
    );
  };

  return (
    <div className="page">
      {header}

      <section className="card">
        <div className="filters">
          <label className="field" htmlFor="filter-from">
            <span className="field__label">From</span>
            <input
              id="filter-from"
              type="date"
              className="field__input"
              value={filters.from}
              onChange={setFilter('from')}
            />
          </label>

          <label className="field" htmlFor="filter-to">
            <span className="field__label">To</span>
            <input
              id="filter-to"
              type="date"
              className="field__input"
              value={filters.to}
              onChange={setFilter('to')}
            />
          </label>

          <label className="field" htmlFor="filter-action">
            <span className="field__label">Action</span>
            <select
              id="filter-action"
              className="field__input"
              value={filters.action}
              onChange={setFilter('action')}
            >
              <option value="">All actions</option>
              {options.actions.map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </select>
          </label>

          <label className="field" htmlFor="filter-outcome">
            <span className="field__label">Outcome</span>
            <select
              id="filter-outcome"
              className="field__input"
              value={filters.outcome}
              onChange={setFilter('outcome')}
            >
              <option value="">All outcomes</option>
              {OUTCOMES.map((outcome) => (
                <option key={outcome.value} value={outcome.value}>
                  {outcome.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" htmlFor="filter-actor">
            <span className="field__label">Actor</span>
            <select
              id="filter-actor"
              className="field__input"
              value={filters.actorId}
              onChange={setFilter('actorId')}
            >
              <option value="">Anyone</option>
              {options.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.fullName} ({actor.employeeId})
                </option>
              ))}
            </select>
          </label>
        </div>

        {!data && <Spinner label="Loading the audit log…" />}

        {data && entries.length === 0 && (
          <p className="muted">
            No audit entries match those filters.{' '}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setFilters(BLANK_FILTERS);
                setPage(1);
              }}
            >
              Clear filters
            </button>
          </p>
        )}

        {data && entries.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Action</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">
                      <span className="visually-hidden">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const open = expandedId === entry.id;

                    return [
                      <tr key={entry.id}>
                        <td>{formatDateTime(entry.timestamp)}</td>
                        <td>
                          {entry.actor ? entry.actor.fullName : '(account removed)'}
                          <small className="table__sub">
                            {entry.actor ? entry.actor.employeeId : entry.actorRole}
                          </small>
                        </td>
                        <td>{humanise(entry.action)}</td>
                        <td>
                          <Badge tone={outcomeTone(entry.outcome)}>
                            {outcomeLabel(entry.outcome)}
                          </Badge>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            aria-expanded={open}
                            onClick={() => setExpandedId(open ? null : entry.id)}
                          >
                            {open ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>,

                      open && (
                        <tr key={`${entry.id}-detail`} className="audit-detail">
                          <td colSpan={5}>
                            <dl className="detail-list">
                              <dt>Action</dt>
                              <dd>
                                <code>{entry.action}</code>
                              </dd>

                              <dt>Target</dt>
                              <dd>
                                {entry.entityType ? (
                                  <>
                                    {humanise(entry.entityType)}
                                    {entry.entityId && (
                                      <small className="table__sub">
                                        <code>{entry.entityId}</code>
                                      </small>
                                    )}
                                  </>
                                ) : (
                                  '—'
                                )}
                              </dd>

                              <dt>IP address</dt>
                              <dd>{entry.ipAddress || '—'}</dd>

                              <dt>Request</dt>
                              <dd>{entry.requestId ? <code>{entry.requestId}</code> : '—'}</dd>

                              <dt>Device</dt>
                              <dd className="audit-detail__agent">{entry.userAgent || '—'}</dd>

                              {Object.entries(entry.metadata).map(([key, value]) => (
                                <div key={key} className="audit-detail__meta">
                                  <dt>{humanise(key)}</dt>
                                  <dd>{renderValue(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-actions">
              <span className="muted">
                {pagination.total} entr{pagination.total === 1 ? 'y' : 'ies'}
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={exportPage}>
                Download Excel
              </button>
              {pagination.pages > 1 && (
                <span className="table-actions__pager">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage((current) => current - 1);
                      setExpandedId(null);
                    }}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={page >= pagination.pages}
                    onClick={() => {
                      setPage((current) => current + 1);
                      setExpandedId(null);
                    }}
                  >
                    Next
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default AuditLog;
