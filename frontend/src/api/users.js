import client, { unwrap } from './client';

// M1 account management (spec section 8.2). Admin-only on the server; the
// capability gate on these screens is a usability courtesy, never the control.

export const fetchUsers = (params = {}) => unwrap(client.get('/users', { params }));

export const fetchUser = (userId) => unwrap(client.get(`/users/${userId}`));

// Returns `{ user, temporaryPassword }`. The password is generated server-side
// and returned exactly once - there is no endpoint that can read it back, so
// the caller must show it to the admin before navigating away.
export const createUser = (payload) => unwrap(client.post('/users', payload));

// Role, department and status changes end every session the account has open.
// The server does that; this is just the request.
export const updateUser = (userId, patch) => unwrap(client.patch(`/users/${userId}`, patch));

// Issues a fresh temporary password, clears any lockout and signs the account
// out everywhere. Same one-time disclosure rule as `createUser`.
export const resetUserPassword = (userId) =>
  unwrap(client.post(`/users/${userId}/reset-password`, {}));
