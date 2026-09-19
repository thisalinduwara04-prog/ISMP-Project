import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../constants';
import AdminLayout from './AdminLayout';
import Layout from './Layout';

// Chooses the shell from the role, not from the route.
//
// The admin sidebar offers Policies, Training, Compliance and Incidents, and
// those routes are shared with other roles. Choosing by route would drop an
// administrator out of the sidebar the moment they opened /policies.
const RoleLayout = () => {
  const { user } = useAuth();
  return user?.role === ROLES.ADMIN ? <AdminLayout /> : <Layout />;
};

export default RoleLayout;
