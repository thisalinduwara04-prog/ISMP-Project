import MyPolicies from '../../components/MyPolicies';
import MyTraining from '../../components/MyTraining';
import NotificationsWidget from '../../components/NotificationsWidget';
import { useAuth } from '../../auth/AuthContext';
import { DEPARTMENT_LABELS } from '../../constants';
import ComplianceDashboard from '../../components/ComplianceDashboard';

// The manager landing screen: live department compliance, then the manager's
// own assigned work. Department scope is enforced again by the backend.
//
// The greeting is the shell's, so the two bands below carry the headings. The
// manager's own work sits under a band of its own so "my team" and "me" are not
// read as one list.
const DepartmentDashboard = () => {
  const { user } = useAuth();
  const department = DEPARTMENT_LABELS[user.department];

  return (
    <div className="stack">
      <div className="widget-grid">
        <div className="widget-grid__band">
          <h2>{department} department</h2>
          <p>Policy acknowledgement and training completion across your team</p>
        </div>
      </div>

      <ComplianceDashboard fixedDepartment={user.department} />

      <div className="widget-grid">
        <div className="widget-grid__band">
          <h2>Your own work</h2>
          <p>Policies and training assigned to you</p>
        </div>

        <MyPolicies />
        <MyTraining />
        <NotificationsWidget span="full" />
      </div>
    </div>
  );
};

export default DepartmentDashboard;
