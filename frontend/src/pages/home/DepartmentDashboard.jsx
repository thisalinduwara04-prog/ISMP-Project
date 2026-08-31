import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';
import ComplianceDashboard from '../../components/ComplianceDashboard';

// Landing page for MANAGER. The compliance figures arrive with M4; what
// matters now is that the scope shown is the one the server assigned, and that
// it cannot be widened from the client.
const DepartmentDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="page">
      <header className="page__header">
        <h1>{DEPARTMENT_LABELS[user.department]} department</h1>
        <p>Compliance overview for your team</p>
      </header>

      <ComplianceDashboard fixedDepartment={user.department} />
    </div>
  );
};

export default DepartmentDashboard;
