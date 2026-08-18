import client from './client';

export const listUsers = () => client.get('/users').then((r) => r.data.users);

export const updateUserRole = (id, role) => client.patch(`/users/${id}/role`, { role }).then((r) => r.data.user);

export const updateUserStatus = (id, isActive) =>
  client.patch(`/users/${id}/status`, { isActive }).then((r) => r.data.user);
