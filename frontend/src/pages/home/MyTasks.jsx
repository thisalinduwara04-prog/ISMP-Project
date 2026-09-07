import MyPolicies from '../../components/MyPolicies';
import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';

// Landing page for EMPLOYEE (UC-02 step 8). Policies land here with M2;
// training and the personal compliance percentage arrive with M3 and M4.
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

      <MyPolicies heading="policies to read" />

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
