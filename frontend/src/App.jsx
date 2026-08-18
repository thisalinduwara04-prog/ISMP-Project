import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Layout from './components/Layout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import PolicyList from './pages/policies/PolicyList';
import PolicyDetail from './pages/policies/PolicyDetail';
import TrainingList from './pages/training/TrainingList';
import TrainingModuleView from './pages/training/TrainingModuleView';
import IncidentList from './pages/incidents/IncidentList';
import ReportIncident from './pages/incidents/ReportIncident';
import IncidentDetail from './pages/incidents/IncidentDetail';
import ComplianceDashboard from './pages/compliance/ComplianceDashboard';
import AdminHome from './pages/admin/AdminHome';
import AdminPolicies from './pages/admin/AdminPolicies';
import PolicyForm from './pages/admin/PolicyForm';
import PolicyAdminDetail from './pages/admin/PolicyAdminDetail';
import AdminTraining from './pages/admin/AdminTraining';
import TrainingForm from './pages/admin/TrainingForm';
import AdminIncidents from './pages/admin/AdminIncidents';
import AdminUsers from './pages/admin/AdminUsers';
import NotFound from './pages/NotFound';
import { ROLES, COMPLIANCE_VIEWER_ROLES } from './constants';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />

            <Route path="/policies" element={<PolicyList />} />
            <Route path="/policies/:id" element={<PolicyDetail />} />

            <Route path="/training" element={<TrainingList />} />
            <Route path="/training/:id" element={<TrainingModuleView />} />

            <Route path="/incidents" element={<IncidentList />} />
            <Route path="/incidents/new" element={<ReportIncident />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />

            <Route element={<RoleRoute roles={COMPLIANCE_VIEWER_ROLES} />}>
              <Route path="/compliance" element={<ComplianceDashboard />} />
            </Route>

            <Route element={<RoleRoute roles={[ROLES.ADMIN]} />}>
              <Route path="/admin" element={<AdminHome />} />
              <Route path="/admin/policies" element={<AdminPolicies />} />
              <Route path="/admin/policies/new" element={<PolicyForm />} />
              <Route path="/admin/policies/:id" element={<PolicyAdminDetail />} />
              <Route path="/admin/training" element={<AdminTraining />} />
              <Route path="/admin/training/new" element={<TrainingForm />} />
              <Route path="/admin/incidents" element={<AdminIncidents />} />
              <Route path="/admin/users" element={<AdminUsers />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
