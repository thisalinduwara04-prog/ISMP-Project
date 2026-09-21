import { useEffect, useState } from 'react';

import { getMyCompliance } from '../../api/compliance';
import Gauge from '../../components/Gauge';
import MyPolicies from '../../components/MyPolicies';
import MyTraining from '../../components/MyTraining';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';

// The employee landing screen: M4's personal compliance figures, with the M2
// policy and M3 training task lists. Reporting an incident (M5) is not here -
// it is the first control on the Incidents page, beside the reports it adds to.
//
// The greeting is the shell's, so there is no page heading here. Rows add up to
// four columns each (see .widget-grid):
//   rows 1-2  readiness gauge (2 wide, 2 tall) beside
//             policies (1) + training (1), then overdue (2) under them
//   row 3     policies to read (2) + training to complete (2)
// Notifications are not repeated here: the bell in the shell header carries
// the unread count and opens the full feed.
const MyTasks = () => {
  const [compliance, setCompliance] = useState({ data: null, error: '' });

  useEffect(() => {
    let active = true;

    getMyCompliance()
      .then((data) => active && setCompliance({ data, error: '' }))
      .catch((requestError) => active && setCompliance({ data: null, error: requestError.message }));

    return () => { active = false; };
  }, []);

  const summary = compliance.data?.summary;
  const loading = !compliance.data && !compliance.error;

  const policiesLeft = summary ? summary.policy.total - summary.policy.completed : null;
  const trainingLeft = summary ? summary.training.total - summary.training.completed : null;
  const overdue = summary?.overdue || 0;

  return (
    <div className="widget-grid">
      <Widget
        title="Your compliance"
        subtitle="policies acknowledged and training passed"
        tall
        loading={loading}
        loadingLabel="Loading your compliance…"
        error={compliance.error && `Compliance summary unavailable. ${compliance.error}`}
      >
        {summary && (
          <Gauge
            label="Your compliance"
            percent={summary.compliancePercent}
            tone={overdue > 0 ? 'alert' : 'default'}
            rows={[
              {
                label: 'Policies acknowledged',
                value: `${summary.policy.completed} of ${summary.policy.total}`,
                percent: summary.policy.percent,
              },
              {
                label: 'Training passed',
                value: `${summary.training.completed} of ${summary.training.total}`,
                percent: summary.training.percent,
              },
            ]}
          />
        )}
      </Widget>

      <StatCard
        label="Policies to read"
        icon="policies"
        value={policiesLeft}
        sub={policiesLeft === 0 ? 'all acknowledged' : 'awaiting your confirmation'}
        tone={policiesLeft === 0 ? 'ok' : 'default'}
        to="/policies"
        loading={loading}
        error={compliance.error && 'Unavailable'}
      />

      <StatCard
        label="Training to complete"
        icon="training"
        value={trainingLeft}
        sub={trainingLeft === 0 ? 'all passed' : 'modules still open'}
        tone={trainingLeft === 0 ? 'ok' : 'default'}
        to="/training"
        loading={loading}
        error={compliance.error && 'Unavailable'}
      />

      <StatCard
        label="Overdue"
        icon="clock"
        value={summary ? overdue : null}
        sub={overdue > 0 ? 'past their due date — do these first' : 'nothing is late'}
        tone={overdue > 0 ? 'alert' : summary ? 'ok' : 'default'}
        wide
        to="/policies"
        loading={loading}
        error={compliance.error && 'Unavailable'}
      />

      <MyPolicies />

      <MyTraining />
    </div>
  );
};

export default MyTasks;
