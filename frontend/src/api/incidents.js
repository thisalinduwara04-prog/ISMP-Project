import client, { unwrap } from './client';

// M5 - spec section 8.6.

// The submission is multipart, because it may carry an attachment.
//
// `Content-Type: undefined` is load-bearing. The shared axios instance sets a
// JSON content type by default, and axios serialises a FormData body to JSON
// when it sees one - the File would be silently dropped rather than uploaded.
// Clearing the header lets the browser set `multipart/form-data` with the
// boundary it generates.
export const submitIncident = ({ type, title, description, occurredAt, attachment }) => {
  const form = new FormData();
  form.append('type', type);
  form.append('title', title);
  form.append('description', description);
  // Only appended when set: an empty string would fail the server's date
  // coercion rather than reading as "not supplied".
  if (occurredAt) form.append('occurredAt', new Date(occurredAt).toISOString());
  if (attachment) form.append('attachment', attachment);

  return unwrap(client.post('/incidents', form, { headers: { 'Content-Type': undefined } }));
};

// Returns { items, total, escalatedOpen }. The server decides whether "items"
// means everyone's incidents or only the caller's.
export const listIncidents = (filters = {}) => {
  // Empty values are dropped rather than sent: the server's query schema is
  // .strict() and would reject `?status=`.
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return unwrap(client.get('/incidents', { params }));
};

export const getIncident = (id) => unwrap(client.get(`/incidents/${id}`));

export const updateIncident = (id, changes) => unwrap(client.patch(`/incidents/${id}`, changes));

// The download route is authenticated, so the file cannot be fetched with a
// plain <a href> - it comes back as a blob and is handed to the browser through
// a temporary object URL.
export const downloadAttachment = async (incidentId, attachmentId, fileName) => {
  const response = await client.get(`/incidents/${incidentId}/attachments/${attachmentId}`, {
    responseType: 'blob',
  });

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
