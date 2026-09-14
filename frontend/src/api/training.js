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

// Admin. Who has completed the module and who has not, both halves in one
// response so the summary and the tables can never disagree. Carries no
// question or option — an author checking who passed has no need of the key.
export const fetchCompletions = (moduleId) =>
  unwrap(client.get(`/training/modules/${moduleId}/completions`));

// Permanent, and destroys every quiz attempt recorded against the module. The
// API refuses without `acknowledgeEvidenceLoss` whenever there is evidence to
// lose, so the first call doubles as "tell me what this would destroy".
export const deleteModule = (moduleId, acknowledgeEvidenceLoss = false) =>
  unwrap(client.delete(`/training/modules/${moduleId}`, { data: { acknowledgeEvidenceLoss } }));

// --- Working through a module (any role) ------------------------------------

// Marks one content item complete. Sends the item, never a percentage: the
// server counts what has actually been completed, which is what stops a client
// from unlocking the quiz by claiming to be finished. Safe to send twice.
export const markItemComplete = (moduleId, itemId) =>
  unwrap(client.post(`/training/modules/${moduleId}/progress`, { itemId }));

// --- The quiz ---------------------------------------------------------------
//
// Nothing here can determine an answer. The questions arrive without their key,
// the grading happens on submit, on the server, and the result says only
// whether each question was right.

// Refused with 403 until every content item is complete, and again once the
// attempts are used up. Returns the attempt already in progress if there is
// one, rather than opening a second - which is how a quiz interrupted by an
// expired session resumes with its clock still running.
export const startAttempt = (moduleId) =>
  unwrap(client.post(`/training/modules/${moduleId}/attempts`, {}));

// Answers as they are chosen, so a phone that dies mid-quiz has lost nothing.
export const saveAnswers = (attemptId, responses) =>
  unwrap(client.patch(`/training/attempts/${attemptId}`, { responses }));

export const submitAttempt = (attemptId) =>
  unwrap(client.post(`/training/attempts/${attemptId}/submit`, {}));

// The paper while it is being sat, the result once it has been graded - the
// server decides which, from the attempt's own status.
export const fetchAttempt = (attemptId) => unwrap(client.get(`/training/attempts/${attemptId}`));

// Admin. Gives one person their attempts back at one module. The historical
// attempts are kept; only the count against the limit restarts.
export const resetAttempts = (moduleId, userId) =>
  unwrap(client.post(`/training/modules/${moduleId}/attempts/reset`, { userId }));
