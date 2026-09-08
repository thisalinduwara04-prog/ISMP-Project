import { useEffect, useState } from 'react';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { fetchCompletions } from '../../api/training';
import { downloadXlsx } from '../../utils/xlsx';
import { formatDateTime, formatDate } from '../../utils/format';

// The training counterpart of the policy acknowledgement trail (UC-12): who has
// completed this module, and who has not.
//
// Completion here is a PASSING QUIZ ATTEMPT, not a click, so each row carries
// the score it was earned with and how many attempts it took. Both lists come
// from a single response, so the summary line can never disagree with the
// tables beneath it.

const STAGE_LABELS = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Working through the content',
  QUIZ_OUTSTANDING: 'Content done — quiz outstanding',
  ATTEMPTS_EXHAUSTED: 'Out of attempts',
};

const CompletionTrail = ({ moduleId, refreshKey }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('completed');

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);

    fetchCompletions(moduleId)
      .then((result) => active && setData(result))
      .catch((loadError) => active && setError(loadError.message));

    return () => {
      active = false;
    };
  }, [moduleId, refreshKey]);

  if (error) {
    return (
      <section className="card">
        <h2>Completions</h2>
        <Alert tone="error">{error}</Alert>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card">
        <h2>Completions</h2>
        <Spinner label="Loading the completion record…" />
      </section>
    );
  }

  const { summary, completed, outstanding } = data;

  // Numbers written as numbers so an auditor can sort and total them in Excel;
  // the timestamp stays an ISO string so it is unambiguous in any locale.
  const exportExcel = () =>
    downloadXlsx(
      [
        ['Employee ID', 'Name', 'Department', 'Completed at', 'Score (%)', 'Attempts used'],
        ...completed.map((row) => [
          row.employeeId,
          row.fullName,
          row.department,
          row.completedAt ? new Date(row.completedAt).toISOString() : null,
          typeof row.scorePercent === 'number' ? row.scorePercent : null,
          row.attemptsUsed,
        ]),
      ],
      `training-completions-${data.module.code}.xlsx`,
      data.module.code
    );

  if (summary.assigned === 0) {
    return (
      <section className="card">
        <h2>Completions</h2>
        <p className="muted">
          {data.module.status === 'PUBLISHED'
            ? 'Nobody holds this module yet.'
            : 'This module has not been published, so nobody has been assigned it. Publishing assigns it to everyone it targets, and their progress appears here.'}
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Completions</h2>
      <p className="muted">
        <strong>
          {summary.completed} of {summary.assigned} completed
        </strong>{' '}
        ({summary.percentComplete}%) — a pass is {data.module.passMark}% or more on the quiz.
      </p>

      <div className="tabs" role="tablist" aria-label="Completion lists">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'completed'}
          className={`tab${tab === 'completed' ? ' tab--active' : ''}`}
          onClick={() => setTab('completed')}
        >
          Completed ({summary.completed})
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

      {tab === 'completed' &&
        (completed.length === 0 ? (
          <p className="muted">Nobody has passed this module yet.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Department</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Score</th>
                    <th scope="col">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((row) => (
                    <tr key={row.userId}>
                      <td>
                        {row.fullName}
                        <small className="table__sub">{row.employeeId}</small>
                      </td>
                      <td>{row.department}</td>
                      <td>{formatDateTime(row.completedAt)}</td>
                      {/* The BEST score, which is what counts for compliance —
                          not whatever the most recent attempt happened to be. */}
                      <td>{row.scorePercent}%</td>
                      <td>
                        {row.attemptsUsed} of {row.attemptsAllowed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={exportExcel}>
                Download Excel
              </button>
            </div>
          </>
        ))}

      {tab === 'outstanding' &&
        (outstanding.length === 0 ? (
          <p className="muted">Everybody assigned this module has completed it.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Department</th>
                  <th scope="col">Where they are</th>
                  <th scope="col">Due</th>
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
                    <td>
                      {STAGE_LABELS[row.stage]}
                      {/* Someone out of attempts is stuck until an admin resets
                          them, so their best score is the useful number. */}
                      {row.bestScorePercent !== null && (
                        <small className="table__sub">best {row.bestScorePercent}%</small>
                      )}
                      {row.stage === 'IN_PROGRESS' && (
                        <small className="table__sub">{row.percentComplete}% of the content</small>
                      )}
                    </td>
                    <td>
                      {formatDate(row.dueDate)}
                      {row.isOverdue && (
                        <small className="table__sub">
                          <span className="badge badge--danger">overdue</span>
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
};

export default CompletionTrail;
