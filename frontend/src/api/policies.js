import client from './client';

export const listPolicies = (all = false) =>
  client.get('/policies', { params: all ? { all: true } : {} }).then((r) => r.data.policies);

export const getPolicy = (id) => client.get(`/policies/${id}`).then((r) => r.data);

export const createPolicy = (payload) => client.post('/policies', payload).then((r) => r.data.policy);

export const updatePolicyMeta = (id, payload) =>
  client.patch(`/policies/${id}`, payload).then((r) => r.data.policy);

export const addPolicyVersion = (id, payload) =>
  client.post(`/policies/${id}/versions`, payload).then((r) => r.data.policy);

export const acknowledgePolicy = (id) => client.post(`/policies/${id}/acknowledge`).then((r) => r.data);

export const archivePolicy = (id) => client.delete(`/policies/${id}`).then((r) => r.data.policy);
