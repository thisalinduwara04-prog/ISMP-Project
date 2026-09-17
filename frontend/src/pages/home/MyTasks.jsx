import { useEffect, useState } from 'react';

import { getMyCompliance } from '../../api/compliance';
import { useAuth } from '../../auth/AuthContext';
import Alert from '../../components/Alert';
import ComplianceSummary from '../../components/ComplianceSummary';
import MyPolicies from '../../components/MyPolicies';
import MyTraining from '../../components/MyTraining';
import Spinner from '../../components/Spinner';
import { DEPARTMENT_LABELS } from '../../constants';

// Employees see their M4 compliance summary together with the policy and
// training task panels owned by M2 and M3.
const MyTasks = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getMyCompliance()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });

    return () => { active = false; };
  }, []);

  return (
    <div className="page">
      <header className="page__header">
        <h1>My tasks</h1>
        <p>{user.fullName} · {DEPARTMENT_LABELS[user.department]}</p>
      </header>

      {error && <Alert tone="error" title="Compliance summary unavailable">{error}</Alert>}
      {!data && !error && <Spinner label="Loading your compliance summary…" />}
      {data && <ComplianceSummary summary={data.summary} />}

      <MyPolicies heading="Policies to read" />

      <MyTraining />
    </div>
  );
};

export default MyTasks;
