import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllIncidents } from '../../api/incidents';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import Alert from '../../components/Alert';
import { INCIDENT_TYPE_LABELS, INCIDENT_STATUS_LABELS, SEVERITY_LABELS } from '../../constants';

const STATUS_TONE = { open: 'warning', in_review: 'info', resolved: 'success' };
const SEVERITY_TONE = { low: 'neutral', medium: 'warning', high: 'danger' };

export default function AdminIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const load = () => {
    setLoading(true);
    const filters = {};
    if (statusFilter) filters.status = statusFilter;
    if (severityFilter) filters.severity = severityFilter;
    listAllIncidents(filters)
      .then(setIncidents)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load incidents.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, severityFilter]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Incident Triage</h1>
        <p className="muted">Review reported incidents and track them through to resolution.</p>
      </div>

      <Alert type="error">{error}</Alert>

      <div className="toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(INCIDENT_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="">All severities</option>
          {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loader label="Loading incidents…" />
      ) : incidents.length === 0 ? (
        <p className="muted">No incidents match these filters.</p>
      ) : (
        <div className="list-table">
          {incidents.map((i) => (
            <Link key={i._id} to={`/incidents/${i._id}`} className="list-row">
              <div className="list-row-main">
                <div className="list-row-title">{INCIDENT_TYPE_LABELS[i.type] || i.type}</div>
                <div className="list-row-sub">
                  {i.reporter?.name} ({i.reporter?.department}) · {new Date(i.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="list-row-meta">
                <Badge tone={SEVERITY_TONE[i.severity]}>{SEVERITY_LABELS[i.severity]}</Badge>
                <Badge tone={STATUS_TONE[i.status]}>{INCIDENT_STATUS_LABELS[i.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
