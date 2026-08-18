import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTraining } from '../../api/training';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';

export default function TrainingList() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTraining()
      .then(setModules)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader label="Loading training modules…" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Security Training &amp; Awareness</h1>
        <p className="muted">Short, role-specific modules with a quick quiz at the end.</p>
      </div>

      {modules.length === 0 ? (
        <p className="muted">No training modules assigned to your role yet.</p>
      ) : (
        <div className="card-grid">
          {modules.map((m) => (
            <Link key={m.id} to={`/training/${m.id}`} className="card training-card">
              <div className="training-card-top">
                <h2>{m.title}</h2>
                <Badge tone={m.completion?.passed ? 'success' : 'warning'}>
                  {m.completion?.passed ? `Passed (${m.completion.score}%)` : 'Not completed'}
                </Badge>
              </div>
              <p className="muted">{m.description}</p>
              <div className="training-card-meta">
                <span>~{m.estimatedMinutes} min</span>
                <span>{m.questionCount} quiz question{m.questionCount === 1 ? '' : 's'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
