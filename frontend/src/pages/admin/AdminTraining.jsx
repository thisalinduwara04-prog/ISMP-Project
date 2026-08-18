import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTraining, deactivateTraining } from '../../api/training';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import Alert from '../../components/Alert';

export default function AdminTraining() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    listTraining(true)
      .then(setModules)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load training modules.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this module? It will be hidden from employees.')) return;
    try {
      await deactivateTraining(id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate module.');
    }
  };

  if (loading) return <Loader label="Loading training modules…" />;

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>Manage Training</h1>
          <p className="muted">Create role-specific training content and quizzes.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/training/new">
          + New module
        </Link>
      </div>

      <Alert type="error">{error}</Alert>

      <div className="list-table">
        {modules.map((m) => (
          <div key={m.id} className="list-row">
            <div className="list-row-main">
              <div className="list-row-title">{m.title}</div>
              <div className="list-row-sub">
                {m.questionCount} question{m.questionCount === 1 ? '' : 's'} · ~{m.estimatedMinutes} min
              </div>
            </div>
            <div className="list-row-meta">
              <Badge tone={m.isActive ? 'success' : 'danger'}>{m.isActive ? 'Active' : 'Inactive'}</Badge>
              {m.isActive && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleDeactivate(m.id)}>
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
