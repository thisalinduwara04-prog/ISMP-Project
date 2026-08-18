import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPolicies } from '../../api/policies';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';

export default function PolicyList() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    listPolicies()
      .then(setPolicies)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader label="Loading policies…" />;

  const visible = policies.filter((p) => {
    if (filter === 'pending') return !p.acknowledged;
    if (filter === 'acknowledged') return p.acknowledged;
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Security Policies</h1>
        <p className="muted">Review and acknowledge the policies that apply to your role.</p>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {['all', 'pending', 'acknowledged'].map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'pending' ? 'Action needed' : 'Acknowledged'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No policies to show.</p>
      ) : (
        <div className="list-table">
          {visible.map((p) => (
            <Link key={p.id} to={`/policies/${p.id}`} className="list-row">
              <div className="list-row-main">
                <div className="list-row-title">{p.title}</div>
                <div className="list-row-sub">{p.category}</div>
              </div>
              <div className="list-row-meta">
                <span className="muted">v{p.currentVersionNumber}</span>
                <Badge tone={p.acknowledged ? 'success' : 'warning'}>
                  {p.acknowledged ? 'Acknowledged' : 'Action needed'}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
