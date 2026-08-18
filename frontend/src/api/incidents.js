import client from './client';

export const createIncident = (formData) =>
  client
    .post('/incidents', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data.incident);

export const listMyIncidents = () => client.get('/incidents/mine').then((r) => r.data.incidents);

export const listAllIncidents = (filters = {}) =>
  client.get('/incidents', { params: filters }).then((r) => r.data.incidents);

export const getIncident = (id) => client.get(`/incidents/${id}`).then((r) => r.data.incident);

export const updateIncidentStatus = (id, payload) =>
  client.patch(`/incidents/${id}/status`, payload).then((r) => r.data.incident);
