import ComplianceDashboard from '../../components/ComplianceDashboard';

const OrganisationCompliance = () => (
  <div className="stack">
    <header className="page__header">
      <h1>Organisation compliance</h1>
      <p>Policy acknowledgement and training completion across Savikro.</p>
    </header>
    <ComplianceDashboard allowOrganisation />
  </div>
);

export default OrganisationCompliance;
