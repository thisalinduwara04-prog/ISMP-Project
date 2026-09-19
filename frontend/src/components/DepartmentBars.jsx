import EmptyState from './EmptyState';
import { DEPARTMENT_LABELS } from '../constants';

// One bar per department, straight from the `departments` array the compliance
// dashboard endpoint already returns. The percentage is printed beside every
// bar, so the comparison never depends on judging bar lengths by eye.
const DepartmentBars = ({ departments = [] }) => {
  if (departments.length === 0) {
    return <EmptyState title="No compliance data" body="No assignments have been issued yet." />;
  }

  return (
    <div>
      {departments.map((row) => (
        <div key={row.department} className="dept-bar">
          <span>{DEPARTMENT_LABELS[row.department] || row.department}</span>
          <span className="dept-bar__track">
            <span className="dept-bar__fill" style={{ width: `${row.compliancePercent}%` }} />
          </span>
          <span className="dept-bar__value">{row.compliancePercent}%</span>
        </div>
      ))}
    </div>
  );
};

export default DepartmentBars;
