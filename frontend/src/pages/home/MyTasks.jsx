import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';

// Landing page for EMPLOYEE (UC-02 step 8). The task list itself arrives with
// M2-M4; this slice delivers the authenticated shell it will live in.
const MyTasks = () => {
  const { user, capabilities } = useAuth();

  return (
    <div className="page">
      <header className="page__header">
        <h1>My tasks</h1>
        <p>
          {user.fullName} · {DEPARTMENT_LABELS[user.department]}
        </p>
      </header>

      <section className="card">
        <h2>Nothing assigned yet</h2>
        <p className="muted">
          Policies to read and training to complete will appear here once an administrator publishes
          them.
        </p>
      </section>

      {/* M5. Sits above the capability list because reporting is the one thing
          on this screen an employee may need in a hurry. */}
      <section className="card">
        <h2>Seen something that looks wrong?</h2>
        <p className="muted">
          An odd email, a missing device, a screen left signed in — report it. You do not need to be
          sure it is a real problem, and reporting is never treated as an admission of fault.
        </p>
        <div className="actions" style={{ marginTop: '1rem' }}>
          <Link to="/incidents/new" className="btn btn--primary">
            Report an incident
          </Link>
          <Link to="/incidents" className="btn btn--ghost">
            My reports
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>What this account can do</h2>
        <p className="muted">
          Granted by the server for the {user.role} role, and re-checked on every request.
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

export default MyTasks;
