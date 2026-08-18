import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyIncidents } from '../../api/incidents';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import { INCIDENT_TYPE_LABELS, INCIDENT_STATUS_LABELS, SEVERITY_LABELS } from '../../constants';

const STATUS_TONE = { open: 'warning', in_review: 'info', resolved: 'success' };
const SEVERITY_TONE = { low: 'neutral', medium: 'warning', high: 'danger' };

export default function IncidentList() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyIncidents()
      .then(setIncidents)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader label="Loading your incident reports…" />;

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>Incident Reports</h1>
          <p className="muted">Report suspicious emails, lost devices, or other security concerns.</p>
        </div>
        <Link className="btn btn-primary" to="/incidents/new">
          + Report an incident
        </Link>
      </div>

      {incidents.length === 0 ? (
        <p className="muted">You haven't reported any incidents yet.</p>
      ) : (
        <div className="list-table">
          {incidents.map((i) => (
            <Link key={i._id} to={`/incidents/${i._id}`} className="list-row">
              <div className="list-row-main">
                <div className="list-row-title">{INCIDENT_TYPE_LABELS[i.type] || i.type}</div>
                <div className="list-row-sub">{new Date(i.createdAt).toLocaleString()}</div>
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
