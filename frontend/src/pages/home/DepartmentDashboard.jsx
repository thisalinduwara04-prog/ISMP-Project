import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';

// Landing page for MANAGER. The compliance figures arrive with M4; what
// matters now is that the scope shown is the one the server assigned, and that
// it cannot be widened from the client.
const DepartmentDashboard = () => {
  const { user, capabilities } = useAuth();

  return (
    <div className="page">
      <header className="page__header">
        <h1>{DEPARTMENT_LABELS[user.department]} department</h1>
        <p>Compliance overview for your team</p>
      </header>

      <section className="card">
        <h2>No compliance data yet</h2>
        <p className="muted">
          Acknowledgement and training-completion rates for your department will appear here once
          policies and training modules are published.
        </p>
      </section>

      <section className="card">
        <h2>Your reporting scope</h2>
        <p className="muted">
          Fixed to <strong>{DEPARTMENT_LABELS[user.department]}</strong> by the server. Requesting a
          different department is refused and recorded in the audit log.
        </p>
        <ul className="chips">
          {capabilities.map((capability) => (
            <li key={capability} className="chip">
              {capability.replaceAll('_', ' ').toLowerCase()}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default DepartmentDashboard;
