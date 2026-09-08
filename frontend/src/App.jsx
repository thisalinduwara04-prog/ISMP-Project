import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { ProtectedRoute, PublicOnlyRoute, RequireCapability } from './auth/guards';
import { useAuth } from './auth/AuthContext';
import { CAPABILITIES, homePathFor } from './constants';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import MyTasks from './pages/home/MyTasks';
import PolicyList from './pages/policies/PolicyList';
import PolicyDetail from './pages/policies/PolicyDetail';
import PolicyReader from './pages/policies/PolicyReader';
import PolicyNew from './pages/policies/PolicyNew';
import VersionEditor from './pages/policies/VersionEditor';
import ModuleList from './pages/training/ModuleList';
import ModuleBuilder from './pages/training/ModuleBuilder';
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

        {/* M2. Not capability-gated: every role holds POLICY_VIEW_ASSIGNED,
            and which policies are actually returned is decided by the API from
            the caller's role and department, never here. */}
        <Route path="/policies" element={<PolicyList />} />

        {/* Authoring. Gated on POLICY_AUTHOR so the screens are not offered to
            someone who cannot use them — the API refuses them regardless. */}
        <Route
          path="/policies/new"
          element={(
            <RequireCapability capability={CAPABILITIES.POLICY_AUTHOR}>
              <PolicyNew />
            </RequireCapability>
          )}
        />
        <Route
          path="/policies/:policyId/versions/new"
          element={(
            <RequireCapability capability={CAPABILITIES.POLICY_AUTHOR}>
              <VersionEditor />
            </RequireCapability>
          )}
        />
        <Route
          path="/policies/:policyId/versions/:versionId/edit"
          element={(
            <RequireCapability capability={CAPABILITIES.POLICY_AUTHOR}>
              <VersionEditor />
            </RequireCapability>
          )}
        />

        {/* M3 authoring. Gated on TRAINING_AUTHOR so the screens are not
            offered to someone who cannot use them — the API refuses them
            regardless. The employee-facing module player lands with M3-T4. */}
        <Route
          path="/training"
          element={(
            <RequireCapability capability={CAPABILITIES.TRAINING_AUTHOR}>
              <ModuleList />
            </RequireCapability>
          )}
        />
        <Route
          path="/training/modules/new"
          element={(
            <RequireCapability capability={CAPABILITIES.TRAINING_AUTHOR}>
              <ModuleBuilder />
            </RequireCapability>
          )}
        />
        <Route
          path="/training/modules/:moduleId/edit"
          element={(
            <RequireCapability capability={CAPABILITIES.TRAINING_AUTHOR}>
              <ModuleBuilder />
            </RequireCapability>
          )}
        />

        <Route path="/policies/:policyId" element={<PolicyDetail />} />
        <Route path="/policies/:policyId/versions/:versionId" element={<PolicyReader />} />

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
