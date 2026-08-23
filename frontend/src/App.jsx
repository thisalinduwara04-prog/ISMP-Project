import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { ProtectedRoute, PublicOnlyRoute, RequireCapability } from './auth/guards';
import { useAuth } from './auth/AuthContext';
import { CAPABILITIES, homePathFor } from './constants';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import MyTasks from './pages/home/MyTasks';
import DepartmentDashboard from './pages/home/DepartmentDashboard';
import AdminConsole from './pages/home/AdminConsole';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';

// "/" is not a page: it forwards each role to its own landing screen.
const RoleHome = () => {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
};

const App = () => (
  <Routes>
    <Route element={<PublicOnlyRoute />}>
      <Route path="/login" element={<Login />} />
    </Route>

    <Route element={<ProtectedRoute />}>
      <Route element={<Layout />}>
        <Route path="/" element={<RoleHome />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Every employee has these. */}
        <Route path="/my-tasks" element={<MyTasks />} />

        {/* Capability-gated. The API enforces the same rules regardless. */}
        <Route
          path="/department"
          element={(
            <RequireCapability capability={CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT}>
              <DepartmentDashboard />
            </RequireCapability>
          )}
        />
        <Route
          path="/admin"
          element={(
            <RequireCapability capability={CAPABILITIES.USER_MANAGE}>
              <AdminConsole />
            </RequireCapability>
          )}
        />

        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>
  </Routes>
);

export default App;
