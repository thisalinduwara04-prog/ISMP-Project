import MyPolicies from '../../components/MyPolicies';
import MyTraining from '../../components/MyTraining';
import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';
import ComplianceDashboard from '../../components/ComplianceDashboard';

// Managers see live department compliance plus their own assigned policy and
// training work. Department scope is enforced again by the backend.
const DepartmentDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="page">
      <header className="page__header">
        <h1>{DEPARTMENT_LABELS[user.department]} department</h1>
        <p>Compliance overview for your team</p>
      </header>

      <ComplianceDashboard fixedDepartment={user.department} />

      <MyPolicies heading="policies to read" />

      <MyTraining />
    </div>
  );
};

export default DepartmentDashboard;
