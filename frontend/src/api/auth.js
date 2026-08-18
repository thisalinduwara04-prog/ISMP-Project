import client from './client';

export const login = (employeeId, password) =>
  client.post('/auth/login', { employeeId, password }).then((r) => r.data);

export const register = (payload) => client.post('/auth/register', payload).then((r) => r.data);

export const getMe = () => client.get('/auth/me').then((r) => r.data);
