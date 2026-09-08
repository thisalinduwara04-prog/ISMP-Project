import { useEffect, useState } from 'react';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { fetchAcknowledgements } from '../../api/policies';
import { downloadXlsx } from '../../utils/xlsx';
import { formatDateTime, formatDate, formatDuration } from '../../utils/format';

// UC-12 / US-015. The evidence trail for one exact version: who agreed, when,
// from where - and who has not.
//
// Both lists come from a single response, so the summary line can never
// disagree with the tables beneath it.

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

  // Numbers are written as numbers so an auditor can sort and total them in
  // Excel; the timestamp stays an ISO string so it is unambiguous whatever
  // locale the file is opened in.
  const exportExcel = () =>
    downloadXlsx(
      [
        ['Employee ID', 'Name', 'Department', 'Acknowledged at', 'Time spent (s)', 'IP address'],
        ...acknowledged.map((row) => [
          row.employeeId,
          row.fullName,
          row.department,
          new Date(row.acknowledgedAt).toISOString(),
          typeof row.timeSpentSeconds === 'number' ? row.timeSpentSeconds : null,
          row.ipAddress,
        ]),
      ],
      `acknowledgements-v${data.version.versionNumber}.xlsx`,
      `Version ${data.version.versionNumber}`
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportExcel}>
                  Download Excel
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
