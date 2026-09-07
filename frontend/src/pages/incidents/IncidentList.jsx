import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Alert from '../../components/Alert';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import Field from '../../components/Field';
import Select from '../../components/Select';
import Spinner from '../../components/Spinner';
import Table from '../../components/Table';
import { listIncidents } from '../../api/incidents';
import { useAuth } from '../../auth/AuthContext';
import {
  CAPABILITIES,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_TONE,
  STATUS_LABELS,
  STATUS_TONE,
} from '../../constants';

const optionsFrom = (labels) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// One page for both audiences, because both call the same endpoint and the
// server decides what "my incidents" means (spec section 8.6). An admin gets
// the triage queue and its filters; everyone else gets their own reports.
const IncidentList = () => {
  const { can } = useAuth();
  const navigate = useNavigate();
  const isTriager = can(CAPABILITIES.INCIDENT_TRIAGE);

  const [filters, setFilters] = useState({ status: '', type: '', severity: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listIncidents(isTriager ? filters : {}));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters, isTriager]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (event) =>
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));

  const columns = [
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => <Link to={`/incidents/${row.id}`}>{row.reference}</Link>,
    },
    { key: 'title', header: 'Title' },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => INCIDENT_TYPE_LABELS[row.type],
    },
    ...(isTriager
      ? [
          {
            key: 'reportedBy',
            header: 'Reported by',
            hideOnMobile: true,
            render: (row) => row.reportedBy?.fullName || '—',
          },
          {
            key: 'severity',
            header: 'Severity',
            render: (row) => (
              <Badge tone={SEVERITY_TONE[row.severity]}>{SEVERITY_LABELS[row.severity]}</Badge>
            ),
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>,
    },
    {
      key: 'createdAt',
      header: 'Reported',
      hideOnMobile: true,
      render: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <div className="page">
      <header className="page__header">
        <h1>{isTriager ? 'Incident queue' : 'My reports'}</h1>
        <p>
          {isTriager
            ? 'Every incident reported across the business, most urgent first.'
            : 'Incidents you have reported, and what has happened to them since.'}
        </p>
      </header>

      {/* UC-24: a standing red banner while anything serious is still open.
          Counted from the same result the queue already loaded. */}
      {isTriager && data?.escalatedOpen > 0 && (
        <div className="banner--alert" role="alert">
          <strong>{data.escalatedOpen} high-severity incident{data.escalatedOpen === 1 ? '' : 's'} still open.</strong>
          <span>These need a response before anything else in the queue.</span>
        </div>
      )}

      {error && <Alert title="Could not load incidents">{error.message}</Alert>}

      {isTriager && (
        <div className="card toolbar">
          <Field label="Status" htmlFor="filter-status">
            <Select
              id="filter-status"
              value={filters.status}
              onChange={setFilter('status')}
              options={[{ value: '', label: 'Any status' }, ...optionsFrom(STATUS_LABELS)]}
            />
          </Field>
          <Field label="Severity" htmlFor="filter-severity">
            <Select
              id="filter-severity"
              value={filters.severity}
              onChange={setFilter('severity')}
              options={[{ value: '', label: 'Any severity' }, ...optionsFrom(SEVERITY_LABELS)]}
            />
          </Field>
          <Field label="Type" htmlFor="filter-type">
            <Select
              id="filter-type"
              value={filters.type}
              onChange={setFilter('type')}
              options={[{ value: '', label: 'Any type' }, ...optionsFrom(INCIDENT_TYPE_LABELS)]}
            />
          </Field>
        </div>
      )}

      {loading && <Spinner label="Loading incidents…" />}

      {!loading && data?.items.length === 0 && (
        <EmptyState
          title={isTriager ? 'Nothing in the queue' : 'You have not reported anything yet'}
          body={
            isTriager
              ? 'No incidents match this view. Clear the filters to see everything that has been reported.'
              : 'If you see something that looks wrong — an odd email, a missing device, a screen left signed in — report it here.'
          }
          action={
            <Link to="/incidents/new" className="btn btn--primary">
              Report an incident
            </Link>
          }
        />
      )}

      {!loading && data?.items.length > 0 && (
        <Table
          columns={columns}
          rows={data.items}
          onRowClick={(row) => navigate(`/incidents/${row.id}`)}
          caption={`${data.total} incident${data.total === 1 ? '' : 's'}`}
        />
      )}
    </div>
  );
};

export default IncidentList;
