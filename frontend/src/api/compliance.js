import client from './client';

export const getComplianceOverview = () => client.get('/compliance/overview').then((r) => r.data);

// Excel/PDF export downloads: fetched as a blob then saved via an
// object URL so the browser triggers a normal file download.
async function downloadBlob(path, filename) {
  const res = await client.get(path, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const downloadComplianceExcel = () => downloadBlob('/compliance/export/excel', 'compliance-report.xlsx');
export const downloadCompliancePdf = () => downloadBlob('/compliance/export/pdf', 'compliance-report.pdf');
