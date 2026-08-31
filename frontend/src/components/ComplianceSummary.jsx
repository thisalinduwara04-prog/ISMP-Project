const Metric = ({ label, value, detail }) => (
  <section className="card metric">
    <span className="metric__label">{label}</span>
    <strong className="metric__value">{value}</strong>
    {detail && <span className="metric__detail">{detail}</span>}
  </section>
);

const ComplianceSummary = ({ summary }) => (
  <div className="metrics" aria-label="Compliance summary">
    <Metric label="Overall compliance" value={`${summary.compliancePercent}%`} detail={`${summary.completed} of ${summary.total} complete`} />
    <Metric label="Policy acknowledgement" value={`${summary.policy.percent}%`} detail={`${summary.policy.completed} of ${summary.policy.total}`} />
    <Metric label="Training completion" value={`${summary.training.percent}%`} detail={`${summary.training.completed} of ${summary.training.total}`} />
    <Metric label="Overdue" value={summary.overdue} detail={`${summary.outstanding} outstanding`} />
  </div>
);

export default ComplianceSummary;
