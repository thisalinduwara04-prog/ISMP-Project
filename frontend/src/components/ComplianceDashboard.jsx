import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import Alert from './Alert';
import Spinner from './Spinner';
import ComplianceSummary from './ComplianceSummary';
import { DEPARTMENT_LABELS } from '../constants';
import { exportCompliance, getDashboard, getOutstanding, sendReminder } from '../api/compliance';
import { stepUp } from '../api/auth';

const ITEM_TYPES = [
  { value: 'POLICY', label: 'Policies' },
  { value: 'TRAINING', label: 'Training' },
];

const STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const emptyFilters = (department = '') => ({
  department,
  itemType: ITEM_TYPES.map(({ value }) => value),
  status: STATUSES.map(({ value }) => value),
  from: '',
  to: '',
});

const selectionText = (selected, options, allLabel) => {
  if (selected.length === options.length) return allLabel;
  const labels = options.filter(({ value }) => selected.includes(value)).map(({ label }) => label);
  return labels.length === 1 ? labels[0] : `${labels.length} selected`;
};

const CheckboxDropdown = ({ label, selected, options, allLabel, onToggle }) => (
  <div className="field">
    <span className="field__label">{label}</span>
    <details className="check-dropdown" name="compliance-filter-dropdown">
      <summary
        className="field__input check-dropdown__summary"
        aria-label={`${label}: ${selectionText(selected, options, allLabel)}`}
      >
        <span>{selectionText(selected, options, allLabel)}</span>
      </summary>
      <div className="check-dropdown__menu" role="group" aria-label={label}>
        {options.map((option) => (
          <label className="filter-check" key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              disabled={selected.length === 1 && selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  </div>
);

const ComplianceDashboard = ({ fixedDepartment = null, allowOrganisation = false }) => {
  const [filters, setFilters] = useState(() => emptyFilters(fixedDepartment || ''));
  const [appliedFilters, setAppliedFilters] = useState(() => emptyFilters(fixedDepartment || ''));
  const [dashboard, setDashboard] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [action, setAction] = useState('');
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [dashboardData, outstandingData] = await Promise.all([
        getDashboard(appliedFilters),
        getOutstanding({ ...appliedFilters, pageSize: 50 }),
      ]);
      setDashboard(dashboardData);
      setOutstanding(outstandingData);
    } catch (loadError) {
      if (loadError.code === 'STEP_UP_REQUIRED') setStepUpRequired(true);
      else setError(loadError.message);
    } finally {
      setBusy(false);
    }
  }, [appliedFilters]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (event) => setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));

  const toggleFilterOption = (name, value) => {
    setFilters((current) => {
      const selected = current[name];
      const next = selected.includes(value)
        ? selected.filter((option) => option !== value)
        : [...selected, value];

      // A filter group always represents at least one choice. This lets users
      // select either item type/status or any combination without an ambiguous
      // empty selection.
      return next.length ? { ...current, [name]: next } : current;
    });
  };

  const remind = async (row) => {
    setAction(`remind-${row._id}`);
    setError('');
    setNotice('');
    try {
      const result = await sendReminder({ userId: row._id, department: fixedDepartment || appliedFilters.department || undefined });
      setNotice(result.notificationsCreated
        ? `Reminder created for ${row.user.fullName}.`
        : `${row.user.fullName} was already reminded within the last 24 hours.`);
      await load();
    } catch (reminderError) {
      setError(reminderError.message);
    } finally {
      setAction('');
    }
  };

  const download = async (format) => {
    setAction(`export-${format}`);
    setError('');
    try {
      const result = await exportCompliance(format, appliedFilters);
      setNotice(result.queued
        ? `The ${format} report is being generated and will be emailed when ready.`
        : `${format} report downloaded.`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setAction('');
    }
  };

  if (busy && !dashboard) return <Spinner label="Loading compliance data" />;

  return (
    <>
      {error && <Alert tone="error" title="Compliance data unavailable">{error}</Alert>}
      {notice && <Alert tone="info" title="Action completed">{notice}</Alert>}
      {stepUpRequired && (
        <form className="card step-up" onSubmit={async (event) => {
          event.preventDefault();
          setAction('step-up');
          setError('');
          try {
            await stepUp(password);
            setPassword('');
            setStepUpRequired(false);
            await load();
          } catch (stepError) {
            setError(stepError.message);
          } finally {
            setAction('');
          }
        }}>
          <div><h2>Confirm your password</h2><p className="muted">Organisation-wide compliance data requires recent authentication.</p></div>
          <label className="field"><span className="field__label">Password</span><input className="field__input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="btn btn--primary" type="submit" disabled={action === 'step-up'}>{action === 'step-up' ? 'Confirming…' : 'Continue'}</button>
        </form>
      )}

      <form
        className="card filters"
        onSubmit={(event) => {
          event.preventDefault();
          event.currentTarget.querySelectorAll('details[open]').forEach((dropdown) => dropdown.removeAttribute('open'));
          setAppliedFilters(filters);
        }}
      >
        {allowOrganisation && (
          <label className="field">
            <span className="field__label">Department</span>
            <select className="field__input" name="department" value={filters.department} onChange={updateFilter}>
              <option value="">All departments</option>
              {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        <CheckboxDropdown
          label="Item type"
          selected={filters.itemType}
          options={ITEM_TYPES}
          allLabel="Policies and training"
          onToggle={(value) => toggleFilterOption('itemType', value)}
        />
        <CheckboxDropdown
          label="Status"
          selected={filters.status}
          options={STATUSES}
          allLabel="All live statuses"
          onToggle={(value) => toggleFilterOption('status', value)}
        />
        <label className="field">
          <span className="field__label">Assigned from</span>
          <input className="field__input" type="date" name="from" value={filters.from} onChange={updateFilter} />
        </label>
        <label className="field">
          <span className="field__label">Assigned to</span>
          <input className="field__input" type="date" name="to" value={filters.to} onChange={updateFilter} />
        </label>
        <div className="filters__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>Apply filters</button>
          <button className="btn btn--ghost" type="button" onClick={(event) => {
            const reset = emptyFilters(fixedDepartment || '');
            setFilters(reset);
            setAppliedFilters(reset);
            event.currentTarget.form.querySelectorAll('details[open]').forEach((dropdown) => dropdown.removeAttribute('open'));
          }}>Reset</button>
        </div>
      </form>

      {dashboard && dashboard.summary.total === 0 ? (
        <section className="card"><h2>No compliance data yet</h2><p className="muted">No policies or training match this scope and filter.</p></section>
      ) : dashboard && (
        <>
          <ComplianceSummary summary={dashboard.summary} />
          <section className="card chart-card">
            <div className="section-heading"><div><h2>Compliance by department</h2><p className="muted">As of {new Date(dashboard.asOf).toLocaleString()}{dashboard.cached ? ' · cached' : ''}</p></div></div>
            <div className="chart" role="img" aria-label="Department compliance percentage bar chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.departments.map((row) => ({ ...row, name: DEPARTMENT_LABELS[row.department] || row.department }))}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(value) => [`${value}%`, 'Compliance']} /><Bar dataKey="compliancePercent" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      <section className="card">
        <div className="section-heading">
          <div><h2>Outstanding staff</h2><p className="muted">Ordered by oldest due item.</p></div>
          <div className="button-row">
            <button className="btn btn--ghost btn--sm" type="button" disabled={!!action} onClick={() => download('PDF')}>{action === 'export-PDF' ? 'Preparing…' : 'Export PDF'}</button>
            <button className="btn btn--ghost btn--sm" type="button" disabled={!!action} onClick={() => download('XLSX')}>{action === 'export-XLSX' ? 'Preparing…' : 'Export Excel'}</button>
          </div>
        </div>
        {!outstanding?.items.length ? <p className="muted">Everyone in this scope is compliant.</p> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Department</th><th>Outstanding</th><th>Overdue</th><th>Oldest due</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{outstanding.items.map((row) => (
                <tr key={row._id}>
                  <td><strong>{row.user.fullName}</strong><small>{row.user.employeeId}</small></td>
                  <td>{DEPARTMENT_LABELS[row.department] || row.department}</td><td>{row.outstandingCount}</td><td>{row.overdueCount}</td>
                  <td>{new Date(row.oldestDueDate).toLocaleDateString()}</td>
                  <td><button className="btn btn--ghost btn--sm" type="button" disabled={!!action} onClick={() => remind(row)}>{action === `remind-${row._id}` ? 'Sending…' : 'Remind'}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};

export default ComplianceDashboard;
