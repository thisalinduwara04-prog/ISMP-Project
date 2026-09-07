import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Field from '../../components/Field';
import Select from '../../components/Select';
import Spinner from '../../components/Spinner';
import Textarea from '../../components/Textarea';
import { downloadAttachment, getIncident, updateIncident } from '../../api/incidents';
import { useAuth } from '../../auth/AuthContext';
import {
  ALLOWED_STATUS_TRANSITIONS,
  CAPABILITIES,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_TONE,
  STATUSES_REQUIRING_NOTE,
  STATUS_LABELS,
  STATUS_TONE,
} from '../../constants';

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const IncidentDetail = () => {
  const { id } = useParams();
  const { can } = useAuth();
  const isTriager = can(CAPABILITIES.INCIDENT_TRIAGE);

  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Triage panel state, admin only.
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { incident: found } = await getIncident(id);
      setIncident(found);
      setSeverity(found.severity);
      setStatus('');
      setNote('');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner label="Loading incident…" />;

  if (error) {
    return (
      <div className="page">
        <Alert title="Could not open this incident">
          {error.message}
          {error.status === 404 && ' You can only view incidents you reported.'}
        </Alert>
        <Link to="/incidents" className="btn btn--ghost">
          Back to incidents
        </Link>
      </div>
    );
  }

  // Only transitions the server would accept are offered. The server checks
  // again on every request; this just avoids presenting a dead end
  // (NFR-SEC-03).
  const nextStatuses = ALLOWED_STATUS_TRANSITIONS[incident.status] || [];
  const noteRequired = STATUSES_REQUIRING_NOTE.includes(status);
  const severityChanged = severity && severity !== incident.severity;
  const hasChange = Boolean(status) || severityChanged;
  const canSave = hasChange && (!noteRequired || note.trim().length > 0);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);

    try {
      const changes = {};
      if (status) changes.status = status;
      if (severityChanged) changes.severity = severity;
      if (note.trim()) changes.note = note.trim();

      const { incident: updated } = await updateIncident(id, changes);
      setIncident(updated);
      setSeverity(updated.severity);
      setStatus('');
      setNote('');
      setSaved(true);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>{incident.reference}</h1>
        <p>{incident.title}</p>
      </header>

      <div className="card stack">
        <dl className="detail-grid">
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={STATUS_TONE[incident.status]}>{STATUS_LABELS[incident.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt>Severity</dt>
            <dd>
              <Badge tone={SEVERITY_TONE[incident.severity]}>
                {SEVERITY_LABELS[incident.severity]}
              </Badge>
              {isTriager && incident.severitySetBy === 'ADMIN_OVERRIDE' && (
                <small className="timeline__meta">Overridden by an administrator</small>
              )}
            </dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{INCIDENT_TYPE_LABELS[incident.type]}</dd>
          </div>
          <div>
            <dt>Reported</dt>
            <dd>{formatDateTime(incident.createdAt)}</dd>
          </div>
          <div>
            <dt>Occurred</dt>
            <dd>{formatDateTime(incident.occurredAt)}</dd>
          </div>
          {isTriager && (
            <>
              <div>
                <dt>Reported by</dt>
                <dd>
                  {incident.reportedBy?.fullName || '—'}
                  <small className="timeline__meta">{incident.reporterDepartment}</small>
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{incident.assignedTo?.fullName || 'Unassigned'}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="card">
        <h2 className="section-title">What was reported</h2>
        <p className="prose">{incident.description}</p>
      </div>

      {incident.attachments.length > 0 && (
        <div className="card">
          <h2 className="section-title">Attachments</h2>
          <ul className="attachment-list">
            {incident.attachments.map((attachment) => (
              <li key={attachment.id}>
                <span>
                  {attachment.fileName}
                  <small className="timeline__meta">{formatSize(attachment.sizeBytes)}</small>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadAttachment(incident.id, attachment.id, attachment.fileName)}
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {incident.resolutionNote && (
        <div className="card">
          <h2 className="section-title">Outcome</h2>
          <p className="prose">{incident.resolutionNote}</p>
        </div>
      )}

      {/* UC-23. Admin only, and the server enforces every rule this form
          expresses regardless of what is rendered here. */}
      {isTriager && (
        <form className="card" onSubmit={handleSave}>
          <h2 className="section-title">Update this incident</h2>

          {saved && (
            <Alert tone="success" title="Incident updated">
              The change has been recorded in the handling history below.
            </Alert>
          )}

          {saveError && (
            <Alert title="Could not update this incident">
              {saveError.message}
              {saveError.details?.length > 0 && (
                <ul className="alert__list">
                  {saveError.details.map((detail) => (
                    <li key={`${detail.field}-${detail.issue}`}>
                      {detail.field}: {detail.issue}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          {nextStatuses.length === 0 ? (
            <p className="muted">This incident is closed. Its record can no longer be changed.</p>
          ) : (
            <>
              <Field label="Move to" htmlFor="status">
                <Select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={[
                    { value: '', label: `Leave as ${STATUS_LABELS[incident.status]}` },
                    ...nextStatuses.map((value) => ({ value, label: STATUS_LABELS[value] })),
                  ]}
                />
              </Field>

              <Field
                label="Severity"
                htmlFor="severity"
                hint="Set by the system from the incident type. Changing it is recorded as an override."
              >
                <Select
                  id="severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </Field>

              <Field
                label={noteRequired ? 'Resolution note' : 'Note'}
                htmlFor="note"
                optional={!noteRequired}
                hint={
                  noteRequired
                    ? 'Required: say what was done, so the handling record stands on its own.'
                    : 'Added to the handling history below.'
                }
              >
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  required={noteRequired}
                />
              </Field>

              <Button type="submit" disabled={!canSave} busy={saving} busyLabel="Saving…">
                Save update
              </Button>
            </>
          )}
        </form>
      )}

      {isTriager && incident.statusHistory?.length > 0 && (
        <div className="card">
          <h2 className="section-title">Handling history</h2>
          <ol className="timeline">
            {incident.statusHistory.map((entry, index) => (
              // eslint-disable-next-line react/no-array-index-key -- entries are
              // append-only and never reordered, so the index is stable.
              <li key={index} className="timeline__item">
                <div className="timeline__head">
                  {entry.fromStatus && (
                    <>
                      <Badge tone={STATUS_TONE[entry.fromStatus]}>
                        {STATUS_LABELS[entry.fromStatus]}
                      </Badge>
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                  <Badge tone={STATUS_TONE[entry.toStatus]}>{STATUS_LABELS[entry.toStatus]}</Badge>
                </div>
                <small className="timeline__meta">
                  {entry.changedBy?.fullName || 'System'} · {formatDateTime(entry.changedAt)}
                </small>
                {entry.note && <p className="timeline__note">{entry.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="actions">
        <Link to="/incidents" className="btn btn--ghost">
          Back to incidents
        </Link>
      </div>
    </div>
  );
};

export default IncidentDetail;
