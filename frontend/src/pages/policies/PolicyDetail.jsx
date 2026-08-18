import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPolicy, acknowledgePolicy } from '../../api/policies';
import Loader from '../../components/Loader';
import Alert from '../../components/Alert';
import Badge from '../../components/Badge';

export default function PolicyDetail() {
  const { id } = useParams();
  const [policy, setPolicy] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acking, setAcking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getPolicy(id)
      .then((data) => {
        setPolicy(data.policy);
        setAcknowledged(data.acknowledged);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load policy.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAcknowledge = async () => {
    setAcking(true);
    try {
      await acknowledgePolicy(id);
      setAcknowledged(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to acknowledge policy.');
    } finally {
      setAcking(false);
    }
  };

  if (loading) return <Loader label="Loading policy…" />;
  if (error && !policy) return <Alert type="error">{error}</Alert>;
  if (!policy) return null;

  const cv = policy.versions?.[policy.versions.length - 1];

  return (
    <div className="page page-narrow">
      <Link to="/policies" className="back-link">
        ← Back to policies
      </Link>

      <div className="page-header">
        <h1>{policy.title}</h1>
        <div className="meta-row">
          <Badge tone="neutral">{policy.category}</Badge>
          <span className="muted">Version {cv?.versionNumber}</span>
          <span className="muted">
            Published {cv ? new Date(cv.publishedAt).toLocaleDateString() : '—'}
            {cv?.publishedBy?.name ? ` by ${cv.publishedBy.name}` : ''}
          </span>
        </div>
      </div>

      <Alert type="error">{error}</Alert>

      {policy.description && <p className="muted">{policy.description}</p>}

      <div className="card policy-content">
        <p>{cv?.content}</p>
      </div>

      <div className="ack-bar">
        {acknowledged ? (
          <Badge tone="success">You have acknowledged this version</Badge>
        ) : (
          <button className="btn btn-primary" onClick={handleAcknowledge} disabled={acking}>
            {acking ? 'Submitting…' : 'I have read and understood this policy'}
          </button>
        )}
      </div>

      {policy.versions.length > 1 && (
        <section className="card">
          <h2>Version history</h2>
          <ul className="version-list">
            {[...policy.versions].reverse().map((v) => (
              <li key={v.versionNumber}>
                <strong>v{v.versionNumber}</strong> — {new Date(v.publishedAt).toLocaleDateString()}
                {v.changeNotes ? ` — ${v.changeNotes}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
