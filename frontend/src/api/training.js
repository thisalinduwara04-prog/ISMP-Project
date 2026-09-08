import client, { unwrap } from './client';

// M3 endpoints (spec section 8.4). Every rule these screens appear to enforce -
// who may author, who may see a module, whether a quiz can be published - is
// enforced again by the API. Nothing here is a security control.
//
// Note what is NOT in these responses for an employee: `isCorrect` and
// `explanation` are stripped server-side by the learner projection (AD-3), so
// there is no answer key in the browser to find.

export const fetchModules = () => unwrap(client.get('/training/modules'));

// Returns the admin view - answer key intact - to an admin, and the learner
// view to everybody else. The same URL, two different bodies, decided by the
// server from the caller's role.
export const fetchModule = (moduleId) => unwrap(client.get(`/training/modules/${moduleId}`));

// --- Authoring (ADMIN) ------------------------------------------------------
//
// Creating a module and publishing it are separate calls on purpose. Only the
// second one assigns work to anybody.

export const createModule = (payload) => unwrap(client.post('/training/modules', payload));

// The whole content-item and question arrays are sent, in their new order. Ids
// are echoed back so the server recognises each item: an item keeps its id, and
// only a genuinely new one is given a fresh one. That is what stops a reorder
// from breaking an employee's progress record.
export const updateModule = (moduleId, payload) =>
  unwrap(client.patch(`/training/modules/${moduleId}`, payload));

// Fans out a TRAINING assignment to every targeted member of staff and returns
// how many were assigned. Safe to call twice: anyone who already holds an
// assignment is skipped rather than assigned again.
export const publishModule = (moduleId) =>
  unwrap(client.post(`/training/modules/${moduleId}/publish`, {}));
