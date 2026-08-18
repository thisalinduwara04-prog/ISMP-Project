import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listPolicies } from '../../api/policies';
import { listTraining } from '../../api/training';
import { listMyIncidents } from '../../api/incidents';
import Loader from '../../components/Loader';

export default function Dashboard() {
  const { user, canViewCompliance, isAdmin } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [training, setTraining] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listPolicies(), listTraining(), listMyIncidents()])
      .then(([p, t, i]) => {
        setPolicies(p);
        setTraining(t);
        setIncidents(i);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader label="Loading your dashboard…" />;

  const pendingPolicies = policies.filter((p) => !p.acknowledged);
  const pendingTraining = training.filter((t) => !t.completion || !t.completion.passed);
  const openIncidents = incidents.filter((i) => i.status !== 'resolved');

  return (
    <div className="page">
      <div className="page-header">
        <h1>Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="muted">Here's where things stand across your security responsibilities.</p>
      </div>

      <div className="stat-grid">
        <StatCard
          label="Policies to acknowledge"
          value={pendingPolicies.length}
          total={policies.length}
          to="/policies"
          tone={pendingPolicies.length ? 'warning' : 'success'}
        />
        <StatCard
          label="Training to complete"
          value={pendingTraining.length}
          total={training.length}
          to="/training"
          tone={pendingTraining.length ? 'warning' : 'success'}
        />
        <StatCard
          label="Your open incident reports"
          value={openIncidents.length}
          total={incidents.length}
          to="/incidents"
          tone={openIncidents.length ? 'info' : 'neutral'}
        />
      </div>

      <div className="card-grid">
        <section className="card">
          <h2>Recent policies</h2>
          {policies.length === 0 && <p className="muted">No policies published for your role yet.</p>}
          <ul className="simple-list">
            {policies.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link to={`/policies/${p.id}`}>{p.title}</Link>
                <span className={`badge ${p.acknowledged ? 'badge-success' : 'badge-warning'}`}>
                  {p.acknowledged ? 'Acknowledged' : 'Action needed'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Training progress</h2>
          {training.length === 0 && <p className="muted">No training modules assigned yet.</p>}
          <ul className="simple-list">
            {training.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link to={`/training/${t.id}`}>{t.title}</Link>
                <span className={`badge ${t.completion?.passed ? 'badge-success' : 'badge-warning'}`}>
                  {t.completion?.passed ? `Passed (${t.completion.score}%)` : 'Not completed'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Quick actions</h2>
          <div className="quick-actions">
            <Link className="btn btn-secondary" to="/incidents/new">
              Report a security incident
            </Link>
            <Link className="btn btn-secondary" to="/policies">
              Browse security policies
            </Link>
            <Link className="btn btn-secondary" to="/training">
              Continue training
            </Link>
            {canViewCompliance && (
              <Link className="btn btn-secondary" to="/compliance">
                View compliance dashboard
              </Link>
            )}
            {isAdmin && (
              <Link className="btn btn-secondary" to="/admin">
                Go to admin console
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, total, to, tone }) {
  return (
    <Link to={to} className={`stat-card stat-${tone}`}>
      <div className="stat-value">
        {value}
        <span className="stat-total"> / {total}</span>
      </div>
      <div className="stat-label">{label}</div>
    </Link>
  );
}
