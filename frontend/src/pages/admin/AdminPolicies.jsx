import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPolicies, archivePolicy } from '../../api/policies';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import Alert from '../../components/Alert';

const STATUS_TONE = { draft: 'neutral', published: 'success', archived: 'danger' };

export default function AdminPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    listPolicies(true)
      .then(setPolicies)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load policies.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this policy? Employees will no longer see it.')) return;
    try {
      await archivePolicy(id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to archive policy.');
    }
  };

  if (loading) return <Loader label="Loading policies…" />;

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>Manage Policies</h1>
          <p className="muted">Create, version, and publish organisation security policies.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/policies/new">
          + New policy
        </Link>
      </div>

      <Alert type="error">{error}</Alert>

      <div className="list-table">
        {policies.map((p) => (
          <div key={p.id} className="list-row">
            <Link to={`/admin/policies/${p.id}`} className="list-row-main">
              <div className="list-row-title">{p.title}</div>
              <div className="list-row-sub">
                {p.category} · v{p.currentVersionNumber ?? '—'}
              </div>
            </Link>
            <div className="list-row-meta">
              <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
              {p.status !== 'archived' && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleArchive(p.id)}>
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
