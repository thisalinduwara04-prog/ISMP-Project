import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../constants';

export default function Layout() {
  const { user, logout, isAdmin, canViewCompliance } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark">SV</span>
          <div>
            <div className="brand-title">Savikro ISPM</div>
            <div className="brand-subtitle">Security Policy &amp; Compliance Platform</div>
          </div>
        </div>

        <nav className="topnav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/policies">Policies</NavLink>
          <NavLink to="/training">Training</NavLink>
          <NavLink to="/incidents">Incidents</NavLink>
          {canViewCompliance && <NavLink to="/compliance">Compliance</NavLink>}
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>

        <div className="topbar-user">
          <div className="user-meta">
            <div className="user-name">{user?.name}</div>
            <div className="user-role">
              {ROLE_LABELS[user?.role] || user?.role} · {user?.employeeId}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={logout} type="button">
            Log out
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
