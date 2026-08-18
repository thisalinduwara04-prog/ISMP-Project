import { Link } from 'react-router-dom';

const SECTIONS = [
  { to: '/admin/policies', title: 'Policy Management', desc: 'Create, version and publish security policies.' },
  { to: '/admin/training', title: 'Training & Awareness', desc: 'Manage training modules and quizzes.' },
  { to: '/admin/incidents', title: 'Incident Triage', desc: 'Review and resolve reported security incidents.' },
  { to: '/admin/users', title: 'User Management', desc: 'Manage employee accounts, roles and access.' },
  { to: '/compliance', title: 'Compliance Dashboard', desc: 'Acknowledgment & training completion reports.' },
];

export default function AdminHome() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin Console</h1>
        <p className="muted">Manage policies, training content, incidents and user accounts.</p>
      </div>

      <div className="card-grid">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="card admin-tile">
            <h2>{s.title}</h2>
            <p className="muted">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
