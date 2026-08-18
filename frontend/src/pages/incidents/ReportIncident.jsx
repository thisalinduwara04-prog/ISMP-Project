import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createIncident } from '../../api/incidents';
import Alert from '../../components/Alert';
import { INCIDENT_TYPE_LABELS } from '../../constants';

export default function ReportIncident() {
  const navigate = useNavigate();
  const [type, setType] = useState(Object.keys(INCIDENT_TYPE_LABELS)[0]);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', type);
      formData.append('description', description);
      if (file) formData.append('attachment', file);

      const incident = await createIncident(formData);
      navigate(`/incidents/${incident._id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>Report a Security Incident</h1>
        <p className="muted">
          Report a suspicious email, a lost device, an unauthorized access attempt, or any other security
          concern. Your report goes straight to management.
        </p>
      </div>

      <Alert type="error">{error}</Alert>

      <form className="card form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Incident type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} required>
            {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? Include dates, sender addresses, device details, or anything else relevant."
            required
            minLength={10}
          />
        </label>

        <label className="field">
          <span>Attachment (optional)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,application/pdf,.eml,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <small className="muted">Screenshots, phishing emails (.eml), or photos. Max 10MB.</small>
        </label>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </form>
    </div>
  );
}
