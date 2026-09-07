import { useEffect, useState } from 'react';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { fetchAcknowledgements } from '../../api/policies';
import { formatDateTime, formatDate, formatDuration } from '../../utils/format';

// UC-12 / US-015. The evidence trail for one exact version: who agreed, when,
// from where - and who has not.
//
// Both lists come from a single response, so the summary line can never
// disagree with the tables beneath it.

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  // A leading =, + or - makes Excel treat a cell as a formula. Prefixing an
  // apostrophe keeps an exported record inert when someone opens it.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

const downloadCsv = (rows, filename) => {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
};

const AcknowledgementTrail = ({ policyId, versionId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('acknowledged');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setData(null);
    setError(null);
    setPage(1);
  }, [versionId]);

  useEffect(() => {
    let active = true;

    fetchAcknowledgements(policyId, versionId, page)
      .then((result) => active && setData(result))
      .catch((loadError) => active && setError(loadError.message));

    return () => {
      active = false;
    };
  }, [policyId, versionId, page]);

  if (error) {
    return (
      <section className="card">
        <h2>Acknowledgements</h2>
        <Alert tone="error">{error}</Alert>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card">
        <h2>Acknowledgements</h2>
        <Spinner label="Loading the evidence trail…" />
      </section>
    );
  }

  const { summary, acknowledged, outstanding, pagination } = data;

  const exportCsv = () =>
    downloadCsv(
      [
        ['Employee ID', 'Name', 'Department', 'Acknowledged at', 'Time spent (s)', 'IP address'],
        ...acknowledged.map((row) => [
          row.employeeId,
          row.fullName,
          row.department,
          new Date(row.acknowledgedAt).toISOString(),
          row.timeSpentSeconds,
          row.ipAddress,
        ]),
      ],
      `acknowledgements-v${data.version.versionNumber}.csv`
    );

  return (
    <section className="card">
      <h2>Acknowledgements</h2>
      <p className="muted">
        <strong>
          {summary.acknowledged} of {summary.assigned} acknowledged
        </strong>{' '}
        for version {data.version.versionNumber} ({summary.percentComplete}%).
      </p>

      <div className="tabs" role="tablist" aria-label="Acknowledgement lists">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'acknowledged'}
          className={`tab${tab === 'acknowledged' ? ' tab--active' : ''}`}
          onClick={() => setTab('acknowledged')}
        >
          Acknowledged ({summary.acknowledged})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'outstanding'}
          className={`tab${tab === 'outstanding' ? ' tab--active' : ''}`}
          onClick={() => setTab('outstanding')}
        >
          Outstanding ({summary.outstanding})
        </button>
      </div>

      {tab === 'acknowledged' && (
        <>
          {acknowledged.length === 0 ? (
            <p className="muted">Nobody has acknowledged this version yet.</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Employee</th>
                      <th scope="col">Department</th>
                      <th scope="col">Acknowledged</th>
                      <th scope="col">Time spent</th>
                      <th scope="col">IP address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acknowledged.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.fullName}
                          <small className="table__sub">{row.employeeId}</small>
                        </td>
                        <td>{row.department}</td>
                        <td>{formatDateTime(row.acknowledgedAt)}</td>
                        <td>{formatDuration(row.timeSpentSeconds) || '—'}</td>
                        <td>{row.ipAddress || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportCsv}>
                  Download CSV
                </button>

                {pagination.pages > 1 && (
                  <span className="table-actions__pager">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => current - 1)}
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
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </button>
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'outstanding' && (
        <>
          {outstanding.length === 0 ? (
            <p className="muted">Everyone assigned this version has acknowledged it.</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Department</th>
                    <th scope="col">Due</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((row) => (
                    <tr key={row.userId}>
                      <td>
                        {row.fullName}
                        <small className="table__sub">{row.employeeId}</small>
                      </td>
                      <td>{row.department}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td>
                        <span className={`badge badge--${row.isOverdue ? 'danger' : 'warning'}`}>
                          {row.isOverdue ? 'Overdue' : 'Not yet due'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default AcknowledgementTrail;
