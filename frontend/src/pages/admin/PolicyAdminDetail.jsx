import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPolicy, addPolicyVersion, updatePolicyMeta } from '../../api/policies';
import Loader from '../../components/Loader';
import Alert from '../../components/Alert';
import Badge from '../../components/Badge';

export default function PolicyAdminDetail() {
  const { id } = useParams();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [newContent, setNewContent] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getPolicy(id)
      .then((data) => setPolicy(data.policy))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load policy.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const handleStatusChange = async (status) => {
    try {
      const updated = await updatePolicyMeta(id, { status });
      setPolicy(updated);
      setNotice(`Status changed to ${status}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handlePublishVersion = async (e) => {
    e.preventDefault();
    setPublishing(true);
    setError('');
    try {
      const updated = await addPolicyVersion(id, { content: newContent, changeNotes });
      setPolicy(updated);
      setNewContent('');
      setChangeNotes('');
      setNotice('New version published. Employees must re-acknowledge.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish new version.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <Loader label="Loading policy…" />;
  if (!policy) return <Alert type="error">{error || 'Policy not found.'}</Alert>;

  const cv = policy.versions?.[policy.versions.length - 1];

  return (
    <div className="page page-narrow">
      <Link to="/admin/policies" className="back-link">
        ← Back to manage policies
      </Link>

      <div className="page-header">
        <h1>{policy.title}</h1>
        <div className="meta-row">
          <Badge tone="neutral">{policy.category}</Badge>
          <Badge tone={policy.status === 'published' ? 'success' : policy.status === 'draft' ? 'neutral' : 'danger'}>
            {policy.status}
          </Badge>
          <span className="muted">Current version: {cv?.versionNumber ?? '—'}</span>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="card">
        <h2>Current content</h2>
        <p>{cv?.content || 'No version published yet.'}</p>
      </div>

      <div className="card">
        <h2>Status</h2>
        <div className="toolbar-actions">
          {['draft', 'published', 'archived'].map((s) => (
            <button
              key={s}
              className={`btn ${policy.status === s ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => handleStatusChange(s)}
              disabled={policy.status === s}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <form className="card form-card" onSubmit={handlePublishVersion}>
        <h2>Publish new version</h2>
        <p className="muted">
          Publishing a new version notifies employees and requires everyone to re-acknowledge the policy.
        </p>
        <label className="field">
          <span>New content</span>
          <textarea rows={6} value={newContent} onChange={(e) => setNewContent(e.target.value)} required minLength={10} />
        </label>
        <label className="field">
          <span>Change notes</span>
          <input value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)} placeholder="What changed and why" />
        </label>
        <button className="btn btn-primary" type="submit" disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish new version'}
        </button>
      </form>

      <section className="card">
        <h2>Version history</h2>
        <ul className="version-list">
          {[...policy.versions].reverse().map((v) => (
            <li key={v.versionNumber}>
              <strong>v{v.versionNumber}</strong> — {new Date(v.publishedAt).toLocaleString()}
              {v.publishedBy?.name ? ` by ${v.publishedBy.name}` : ''}
              {v.changeNotes ? ` — ${v.changeNotes}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
