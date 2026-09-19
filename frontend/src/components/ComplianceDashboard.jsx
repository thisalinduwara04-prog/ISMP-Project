import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import Alert from './Alert';
import EmptyState from './EmptyState';
import Spinner from './Spinner';
import ComplianceSummary from './ComplianceSummary';
import Widget from './Widget';
import { useToast } from './ToastProvider';
import { DEPARTMENT_LABELS } from '../constants';
import { exportCompliance, getDashboard, getOutstanding, sendReminder } from '../api/compliance';
import { stepUp } from '../api/auth';

// Recharts takes a colour value, not a class, so the theme's --brand graphite
// is repeated here. Change one and change the other.
const BAR_COLOUR = '#2c3a4b';

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
  const { notify } = useToast();
  const [error, setError] = useState('');
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
    try {
      const result = await sendReminder({ userId: row._id, department: fixedDepartment || appliedFilters.department || undefined });
      notify(result.notificationsCreated
        ? { tone: 'success', title: 'Reminder sent', message: `${row.user.fullName} has been notified about their outstanding items.` }
        : { tone: 'info', title: 'Already reminded', message: `${row.user.fullName} was reminded within the last 24 hours.` });
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
      notify(result.queued
        ? { tone: 'info', title: `${format} report queued`, message: 'It is being generated and will be emailed to you when ready.' }
        : { tone: 'success', title: `${format} report downloaded` });
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setAction('');
    }
  };

  if (busy && !dashboard) return <Spinner label="Loading compliance data" />;

  // Everything below is an item of one .widget-grid. Rows add up to four:
  //   filters (4) · gauge (2) + overdue (1) + outstanding (1)
  //   department chart (4, organisation view only) · outstanding staff (4)
  // The chart is left off the department view: with one department in scope it
  // would be a single bar repeating the gauge beside it.
  return (
    <div className="widget-grid">
      {error && (
        <div className="widget-grid__full">
          <Alert tone="error" title="Compliance data unavailable">{error}</Alert>
        </div>
      )}
      {stepUpRequired && (
        <form className="card step-up widget-grid__full" onSubmit={async (event) => {
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
        className="card filters widget-grid__full"
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
        <div className="widget-grid__full">
          <EmptyState title="No compliance data yet" body="No policies or training match this scope and filter." />
        </div>
      ) : dashboard && (
        <>
          <ComplianceSummary
            summary={dashboard.summary}
            scopeLabel={fixedDepartment ? 'in your department' : 'in this scope'}
          />
          {allowOrganisation && (
            <Widget
              title="Compliance by department"
              subtitle={`As of ${new Date(dashboard.asOf).toLocaleString()}${dashboard.cached ? ' · cached' : ''}`}
              span="full"
            >
              <div className="chart" role="img" aria-label="Department compliance percentage bar chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.departments.map((row) => ({ ...row, name: DEPARTMENT_LABELS[row.department] || row.department }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e5e8" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(20, 22, 26, 0.04)' }} formatter={(value) => [`${value}%`, 'Compliance']} />
                    <Bar dataKey="compliancePercent" fill={BAR_COLOUR} radius={[8, 8, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Widget>
          )}
        </>
      )}

      <Widget
        title="Outstanding staff"
        subtitle={outstanding?.items.length ? `${outstanding.items.length} people · oldest due item first` : 'Ordered by oldest due item'}
        span="full"
        action={(
          <div className="button-row">
            <button className="btn btn--ghost btn--sm" type="button" disabled={!!action} onClick={() => download('PDF')}>{action === 'export-PDF' ? 'Preparing…' : 'Export PDF'}</button>
            <button className="btn btn--ghost btn--sm" type="button" disabled={!!action} onClick={() => download('XLSX')}>{action === 'export-XLSX' ? 'Preparing…' : 'Export Excel'}</button>
          </div>
        )}
      >
        {!outstanding?.items.length ? <EmptyState title="Everyone is compliant" body="Nobody in this scope has an outstanding item." /> : (
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
      </Widget>
    </div>
  );
};

export default ComplianceDashboard;
