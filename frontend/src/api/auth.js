import client, { unwrap, refreshSession } from './client';

// The API sets and clears the auth cookies itself, so these functions return
// only the profile payload.

export const login = (employeeId, password) =>
  unwrap(client.post('/auth/login', { employeeId, password }));

// Doubles as the session-restore call on page load: the httpOnly refresh
// cookie survives a reload even though nothing is kept in JS memory.
//
// Routed through the shared, de-duplicated refreshSession rather than posting
// directly. Two overlapping refreshes would present the same rotating token
// twice and the server would treat that as a stolen token, ending the session.
export const restoreSession = () => unwrap(refreshSession());

export const logout = () => unwrap(client.post('/auth/logout'));

export const fetchMe = () => unwrap(client.get('/auth/me'));

export const changePassword = (currentPassword, newPassword) =>
  unwrap(client.post('/auth/change-password', { currentPassword, newPassword }));

export const stepUp = (password) => unwrap(client.post('/auth/step-up', { password }));
