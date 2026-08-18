import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Client-side convenience only - every admin endpoint is independently
// enforced server-side, so this just avoids showing an admin page that
// would 403 anyway.
export default function RoleRoute({ roles }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
