import client, { unwrap } from './client';

const compactParams = (values) => Object.fromEntries(
  Object.entries(values || {}).filter(([, value]) => value !== '' && value !== undefined && value !== null)
);

export const getMyCompliance = () => unwrap(client.get('/compliance/me'));

export const getDashboard = (filters = {}) =>
  unwrap(client.get('/compliance/dashboard', { params: compactParams(filters) }));

export const getOutstanding = (filters = {}) =>
  unwrap(client.get('/compliance/outstanding', { params: compactParams(filters) }));

export const sendReminder = ({ userId, department }) =>
  unwrap(client.post('/compliance/reminders', {
    userIds: [userId],
    assignmentIds: [],
    ...(department ? { department } : {}),
  }));

export const exportCompliance = async (format, filters = {}) => {
  const response = await client.post(
    '/compliance/reports/export',
    { format, ...compactParams(filters) },
    { responseType: 'blob' }
  );
  if (response.status === 202) {
    const payload = JSON.parse(await response.data.text());
    return payload.data;
  }
  const disposition = response.headers['content-disposition'] || '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `compliance-report.${format.toLowerCase()}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { queued: false };
};
