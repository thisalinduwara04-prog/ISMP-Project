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
// The greeting is the shell's, so there is no page heading here. Twelve
// columns (see .widget-grid--dashboard):
//   row 1  policies to read, training to complete, overdue (4+4+4)
//   row 2  compliance gauge (4) + training to complete (8)
//   row 3  policies to read, on a line of its own (full width)
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
    <div className="widget-grid widget-grid--dashboard widget-grid--three-cards">
      <StatCard
        label="Policies to read"
        icon="policies"
        accent="green"
        value={policiesLeft}
        sub={policiesLeft === 0 ? 'All acknowledged' : 'Awaiting your confirmation'}
        tone={policiesLeft === 0 ? 'ok' : 'default'}
        to="/policies"
        loading={loading}
        error={compliance.error && 'Unavailable'}
      />

      <StatCard
        label="Training to complete"
        icon="clock"
        accent="amber"
        value={trainingLeft}
        sub={trainingLeft === 0 ? 'All passed' : 'Modules still open'}
        tone={trainingLeft === 0 ? 'ok' : 'default'}
        to="/training"
        loading={loading}
        error={compliance.error && 'Unavailable'}
      />

      <StatCard
        label="Overdue items"
        icon="clock"
        accent={overdue > 0 ? 'red' : 'blue'}
        value={summary ? overdue : null}
        sub={overdue > 0 ? 'Past their due date — do these first' : 'Nothing is late'}
        tone={overdue > 0 ? 'alert' : summary ? 'ok' : 'default'}
        to="/policies"
        loading={loading}
        error={compliance.error && 'Unavailable'}
      />

      <Widget
        title="Your compliance"
        subtitle="policies acknowledged and training passed"
        span="third"
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

      <MyTraining span="three" />

      <MyPolicies span="full" />
    </div>
  );
};

export default MyTasks;
