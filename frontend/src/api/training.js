import client from './client';

export const listTraining = (all = false) =>
  client.get('/training', { params: all ? { all: true } : {} }).then((r) => r.data.modules);

export const getTrainingModule = (id) => client.get(`/training/${id}`).then((r) => r.data);

export const createTraining = (payload) => client.post('/training', payload).then((r) => r.data.module);

export const updateTraining = (id, payload) =>
  client.patch(`/training/${id}`, payload).then((r) => r.data.module);

export const deactivateTraining = (id) => client.delete(`/training/${id}`).then((r) => r.data.module);

export const submitQuiz = (id, answers) =>
  client.post(`/training/${id}/submit`, { answers }).then((r) => r.data);
