import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext';
import Spinner from '../components/Spinner';

// Waits for the silent-refresh to settle before deciding anything. Without
// this, every page reload would briefly redirect to /login.
const useSettledAuth = () => {
  const auth = useAuth();
  return auth;
};

// Requires a session. Remembers where the user was headed so they land there
// after logging in rather than on a generic home page.
export const ProtectedRoute = () => {
  const { isAuthenticated, restoring, mustChangePassword } = useSettledAuth();
  const location = useLocation();

  if (restoring) return <Spinner label="Restoring your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;

  // Mirrors the server-side gate: while a temporary password is outstanding
  // the only reachable screen is the password change form (US-003). The server
  // enforces this too - this just avoids showing pages that would 403.
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
};

// Hides a route the user's role cannot use. Purely a usability measure: the
// API refuses the same request regardless of what the SPA renders (NFR-SEC-03).
export const RequireCapability = ({ capability, children }) => {
  const { can, restoring } = useSettledAuth();

  if (restoring) return <Spinner />;
  if (!can(capability)) return <Navigate to="/forbidden" replace />;

  return children ?? <Outlet />;
};

// Keeps an authenticated user off the login page.
export const PublicOnlyRoute = () => {
  const { isAuthenticated, restoring } = useSettledAuth();

  if (restoring) return <Spinner label="Loading…" />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return <Outlet />;
};
