import { Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './components/AppShell';
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
import ModulePlayer from './pages/training/ModulePlayer';
import QuizAttempt from './pages/training/QuizAttempt';
import DepartmentDashboard from './pages/home/DepartmentDashboard';
import AdminConsole from './pages/home/AdminConsole';
import ReportIncident from './pages/incidents/ReportIncident';
import IncidentList from './pages/incidents/IncidentList';
import IncidentDetail from './pages/incidents/IncidentDetail';
import UserList from './pages/admin/UserList';
import UserNew from './pages/admin/UserNew';
import UserDetail from './pages/admin/UserDetail';
import AuditLog from './pages/admin/AuditLog';
import OrganisationCompliance from './pages/home/OrganisationCompliance';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';
import Notifications from './pages/Notifications';

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
      <Route element={<AppShell />}>
        <Route path="/" element={<RoleHome />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Every employee has these. M5: reporting and viewing your own
            incidents are granted to every role, and the incident screens
            themselves branch on INCIDENT_TRIAGE rather than being separate
            routes - the API returns a different slice to each caller. */}
        <Route path="/my-tasks" element={<MyTasks />} />
        <Route path="/incidents/new" element={<ReportIncident />} />
        <Route path="/incidents" element={<IncidentList />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/notifications" element={<Notifications />} />

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

        {/* M3. Not capability-gated: every role holds TRAINING_COMPLETE, and
            the list decides what to render from what the API returns — an
            author sees every module, everyone else sees their own. */}
        <Route path="/training" element={<ModuleList />} />
        <Route path="/training/modules/:moduleId" element={<ModulePlayer />} />
        <Route path="/training/attempts/:attemptId" element={<QuizAttempt />} />

        {/* Authoring. Gated so the screens are not offered to someone who
            cannot use them — the API refuses them regardless. */}
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
        <Route
          path="/compliance"
          element={(
            <RequireCapability capability={CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION}>
              <OrganisationCompliance />
            </RequireCapability>
          )}
        />

        {/* M1 account management. Gated on USER_MANAGE so the screens are not
            offered to someone who cannot use them — every /users route refuses
            a non-admin regardless of what is rendered here (NFR-SEC-03).
            `/new` is declared before `/:userId` so it is not swallowed by it. */}
        <Route
          path="/admin/users"
          element={(
            <RequireCapability capability={CAPABILITIES.USER_MANAGE}>
              <UserList />
            </RequireCapability>
          )}
        />
        <Route
          path="/admin/users/new"
          element={(
            <RequireCapability capability={CAPABILITIES.USER_MANAGE}>
              <UserNew />
            </RequireCapability>
          )}
        />
        <Route
          path="/admin/users/:userId"
          element={(
            <RequireCapability capability={CAPABILITIES.USER_MANAGE}>
              <UserDetail />
            </RequireCapability>
          )}
        />

        {/* The security log. Gated on AUDIT_VIEW so it is not offered to
            someone who cannot use it — the API refuses regardless. */}
        <Route
          path="/admin/audit-logs"
          element={(
            <RequireCapability capability={CAPABILITIES.AUDIT_VIEW}>
              <AuditLog />
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
