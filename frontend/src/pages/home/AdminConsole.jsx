import { useAuth } from '../../auth/AuthContext';
import { CAPABILITIES } from '../../constants';
import { Link } from 'react-router-dom';

// Landing page for ADMIN. The tiles below are rendered from the capability
// list the server returned - hiding one the user lacks is a usability
// courtesy, not the control. The API refuses the request either way.
const TILES = [
  { capability: CAPABILITIES.USER_MANAGE, title: 'User accounts', body: 'Create, deactivate and re-role staff.', module: 'M1' },
  { capability: CAPABILITIES.POLICY_AUTHOR, title: 'Policies', body: 'Author, version and publish security policies.', module: 'M2' },
  { capability: CAPABILITIES.TRAINING_AUTHOR, title: 'Training', body: 'Build modules and quizzes.', module: 'M3' },
  { capability: CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION, title: 'Compliance', body: 'Organisation-wide dashboard and exports.', module: 'M4', path: '/compliance' },
  { capability: CAPABILITIES.INCIDENT_TRIAGE, title: 'Incidents', body: 'Triage and resolve reported incidents.', module: 'M5' },
  { capability: CAPABILITIES.AUDIT_VIEW, title: 'Audit log', body: 'Review security events and access denials.', module: 'M1' },
];

const AdminConsole = () => {
  const { user, can } = useAuth();

  return (
    <div className="page">
      <header className="page__header">
        <h1>Admin console</h1>
        <p>{user.fullName}</p>
      </header>

      <div className="tiles">
        {TILES.filter((tile) => can(tile.capability)).map((tile) => (
          <section key={tile.title} className="card tile">
            <span className="tile__module">{tile.module}</span>
            <h2>{tile.title}</h2>
            <p className="muted">{tile.body}</p>
            {tile.path ? <Link className="btn btn--primary btn--sm" to={tile.path}>Open module</Link> : <span className="tile__status">Available in a later sprint</span>}
          </section>
        ))}
      </div>
    </div>
  );
};

export default AdminConsole;
