import Gauge from './Gauge';
import StatCard from './StatCard';
import Widget from './Widget';

// The four compliance figures as one row of the widget grid: the overall
// percentage as a gauge with its policy/training split (2 columns), then overdue
// and outstanding as figures (1 each), so the row adds up to four.
//
// Rendered as a fragment because its children are grid items of the caller's
// .widget-grid, not a grid of their own.
const ComplianceSummary = ({ summary, scopeLabel = 'in this scope' }) => (
  <>
    <Widget title="Overall compliance" subtitle={`${summary.completed} of ${summary.total} complete`}>
      <Gauge
        label="Overall compliance"
        percent={summary.compliancePercent}
        tone={summary.overdue > 0 ? 'alert' : 'default'}
        rows={[
          {
            label: 'Policy acknowledgement',
            value: `${summary.policy.percent}%`,
            percent: summary.policy.percent,
          },
          {
            label: 'Training completion',
            value: `${summary.training.percent}%`,
            percent: summary.training.percent,
          },
        ]}
      />
    </Widget>

    <StatCard
      label="Overdue"
      icon="clock"
      value={summary.overdue}
      sub={summary.overdue > 0 ? 'past their due date' : 'nothing is late'}
      tone={summary.overdue > 0 ? 'alert' : 'ok'}
    />

    <StatCard
      label="Outstanding"
      icon="tasks"
      value={summary.outstanding}
      sub={`assignments still open ${scopeLabel}`}
    />
  </>
);

export default ComplianceSummary;
