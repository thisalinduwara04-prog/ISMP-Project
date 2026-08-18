import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getIncident, updateIncidentStatus } from '../../api/incidents';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/Loader';
import Alert from '../../components/Alert';
import Badge from '../../components/Badge';
import {
  INCIDENT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
} from '../../constants';

const STATUS_TONE = { open: 'warning', in_review: 'info', resolved: 'success' };
const SEVERITY_TONE = { low: 'neutral', medium: 'warning', high: 'danger' };

export default function IncidentDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getIncident(id)
      .then((data) => {
        setIncident(data);
        setNextStatus(data.status);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load incident.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await updateIncidentStatus(id, { status: nextStatus, note });
      setIncident(updated);
      setNote('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update incident.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader label="Loading incident…" />;
  if (!incident) return <Alert type="error">{error || 'Incident not found.'}</Alert>;

  return (
    <div className="page page-narrow">
      <Link to={isAdmin ? '/admin/incidents' : '/incidents'} className="back-link">
        ← Back to incidents
      </Link>

      <div className="page-header">
        <h1>{INCIDENT_TYPE_LABELS[incident.type] || incident.type}</h1>
        <div className="meta-row">
          <Badge tone={SEVERITY_TONE[incident.severity]}>{SEVERITY_LABELS[incident.severity]} severity</Badge>
          <Badge tone={STATUS_TONE[incident.status]}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
          <span className="muted">Reported {new Date(incident.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <Alert type="error">{error}</Alert>

      <div className="card">
        <h2>Description</h2>
        <p>{incident.description}</p>
        {incident.attachmentPath && (
          <p>
            <a href={`/uploads/incidents/${incident.attachmentPath}`} target="_blank" rel="noreferrer">
              📎 {incident.attachmentOriginalName || 'View attachment'}
            </a>
          </p>
        )}
        {incident.reporter?.name && (
          <p className="muted">
            Reported by {incident.reporter.name} ({incident.reporter.department})
          </p>
        )}
      </div>

      <div className="card">
        <h2>Timeline</h2>
        <ul className="timeline">
          {incident.timeline.map((t, idx) => (
            <li key={idx}>
              <Badge tone={STATUS_TONE[t.status]}>{INCIDENT_STATUS_LABELS[t.status]}</Badge>
              <span className="muted"> — {new Date(t.changedAt).toLocaleString()}</span>
              {t.note && <p>{t.note}</p>}
            </li>
          ))}
        </ul>
      </div>

      {isAdmin && (
        <form className="card form-card" onSubmit={handleUpdate}>
          <h2>Update status</h2>
          <label className="field">
            <span>New status</span>
            <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
              {Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Update incident'}
          </button>
        </form>
      )}
    </div>
  );
}
