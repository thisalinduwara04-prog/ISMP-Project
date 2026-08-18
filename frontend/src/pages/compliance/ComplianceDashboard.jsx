import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getComplianceOverview, downloadComplianceExcel, downloadCompliancePdf } from '../../api/compliance';
import Loader from '../../components/Loader';
import Alert from '../../components/Alert';
import { ROLE_LABELS } from '../../constants';

export default function ComplianceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    getComplianceOverview()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load compliance data.'))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async (kind) => {
    setExporting(kind);
    try {
      if (kind === 'excel') await downloadComplianceExcel();
      else await downloadCompliancePdf();
    } catch (err) {
      setError(err.response?.data?.message || 'Export failed.');
    } finally {
      setExporting('');
    }
  };

  if (loading) return <Loader label="Loading compliance dashboard…" />;
  if (error && !data) return <Alert type="error">{error}</Alert>;
  if (!data) return null;

  const chartData = data.byDepartment.map((d) => ({
    department: ROLE_LABELS[d.department] || d.department,
    'Policy Ack. %': d.policyAckRate,
    'Training Completion %': d.trainingCompletionRate,
  }));

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>Compliance Dashboard</h1>
          <p className="muted">Policy acknowledgment and training completion across departments.</p>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-secondary" onClick={() => handleExport('excel')} disabled={!!exporting}>
            {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('pdf')} disabled={!!exporting}>
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <Alert type="error">{error}</Alert>

      <div className="stat-grid">
        <SummaryTile label="Active employees" value={data.totals.activeEmployees} />
        <SummaryTile label="Published policies" value={data.totals.publishedPolicies} />
        <SummaryTile label="Active training modules" value={data.totals.activeTrainingModules} />
        <SummaryTile label="Open incidents" value={data.totals.openIncidents} tone="warning" />
        <SummaryTile label="High-severity open" value={data.totals.highSeverityOpenIncidents} tone="danger" />
        <SummaryTile label="Total incidents logged" value={data.totals.totalIncidents} />
      </div>

      <section className="card">
        <h2>Compliance by department</h2>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="department" stroke="var(--muted)" />
              <YAxis stroke="var(--muted)" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }} />
              <Legend />
              <Bar dataKey="Policy Ack. %" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Training Completion %" fill="var(--accent-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <h2>Department breakdown</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Employees</th>
              <th>Policy acknowledgment</th>
              <th>Training completion</th>
            </tr>
          </thead>
          <tbody>
            {data.byDepartment.map((d) => (
              <tr key={d.department}>
                <td>{ROLE_LABELS[d.department] || d.department}</td>
                <td>{d.employeeCount}</td>
                <td>{d.policyAckRate}%</td>
                <td>{d.trainingCompletionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="muted">Generated {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}

function SummaryTile({ label, value, tone = 'neutral' }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
