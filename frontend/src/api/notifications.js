import client, { unwrap } from './client';

export const getNotifications = () => unwrap(client.get('/notifications'));
export const readNotification = (id) => unwrap(client.patch(`/notifications/${id}/read`));
export const readAllNotifications = () => unwrap(client.post('/notifications/read-all'));
