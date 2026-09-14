import client, { unwrap } from './client';

// M2 endpoints (spec section 8.3). Every rule these screens appear to enforce
// - who sees what, whether a version can still be acknowledged - is enforced
// again by the API. Nothing here is a security control.

export const fetchPolicies = () => unwrap(client.get('/policies'));

export const fetchPolicy = (policyId) => unwrap(client.get(`/policies/${policyId}`));

// Opening a version is what starts the clock: the server records a
// POLICY_VIEWED event and later derives time-spent-reading from it, so this
// call is not merely a fetch.
export const fetchVersion = (policyId, versionId) =>
  unwrap(client.get(`/policies/${policyId}/versions/${versionId}`));

// Sends no body on purpose. The timestamp, the reading time, the IP and the
// user agent are all recorded server-side, because they are evidence and a
// client cannot be trusted to report them. Submitting twice is safe: the
// second call returns the original record.
export const acknowledgeVersion = (policyId, versionId) =>
  unwrap(client.post(`/policies/${policyId}/versions/${versionId}/acknowledge`, {}));

// Admin. Archived policies are hidden by default even from an admin, so the
// list stays about what is currently in force.
export const fetchAllPolicies = (includeArchived = false) =>
  unwrap(client.get('/policies', { params: includeArchived ? { includeArchived: 'true' } : {} }));

// UC-12. Returns both halves of the question - who acknowledged, and who has
// not - in one response, so the two can never disagree.
export const fetchAcknowledgements = (policyId, versionId, page = 1) =>
  unwrap(
    client.get(`/policies/${policyId}/versions/${versionId}/acknowledgements`, { params: { page } })
  );

export const setPolicyStatus = (policyId, status) =>
  unwrap(client.patch(`/policies/${policyId}`, { status }));

// --- Authoring (ADMIN) ------------------------------------------------------
//
// Three separate calls on purpose. Creating the policy record, writing a
// revision, and deciding to put that revision in front of staff are three
// distinct acts, and only the last one assigns work to anybody.

export const createPolicy = (payload) => unwrap(client.post('/policies', payload));

export const updatePolicy = (policyId, payload) =>
  unwrap(client.patch(`/policies/${policyId}`, payload));

export const createVersion = (policyId, payload) =>
  unwrap(client.post(`/policies/${policyId}/versions`, payload));

export const updateVersion = (policyId, versionId, payload) =>
  unwrap(client.patch(`/policies/${policyId}/versions/${versionId}`, payload));

// Supersedes the previous version, fans out an assignment to every targeted
// member of staff, and returns how many were assigned.
export const publishVersion = (policyId, versionId) =>
  unwrap(client.post(`/policies/${policyId}/versions/${versionId}/publish`, {}));

// Multipart. No Content-Type is set here deliberately: axios detects the
// FormData and lets the browser write the full header including the boundary
// it generated. Setting the header by hand loses the boundary, and the server
// then has nothing to parse the parts with.
// Appends. A version may carry several PDFs, so uploading a second one adds it
// alongside the first rather than replacing it.
export const uploadAttachment = (policyId, versionId, file) => {
  const form = new FormData();
  form.append('file', file);

  return unwrap(client.post(`/policies/${policyId}/versions/${versionId}/attachments`, form));
};

export const deleteAttachment = (policyId, versionId, attachmentId) =>
  unwrap(client.delete(`/policies/${policyId}/versions/${versionId}/attachments/${attachmentId}`));

// Discards an unpublished draft. The API refuses any other status - a version
// somebody has acknowledged cannot be deleted by anyone.
// A draft deletes without ceremony. A version that was published takes its
// acknowledgements with it, so the API refuses the first call and says how
// many would be destroyed.
export const deleteVersion = (policyId, versionId, acknowledgeEvidenceLoss = false) =>
  unwrap(
    client.delete(`/policies/${policyId}/versions/${versionId}`, {
      data: { acknowledgeEvidenceLoss },
    })
  );

// Permanent, and destroys the acknowledgements recorded against every version.
// The API refuses without `acknowledgeEvidenceLoss` whenever there is evidence
// to lose, so the first call doubles as "tell me what this would destroy".
export const deletePolicy = (policyId, acknowledgeEvidenceLoss = false) =>
  unwrap(client.delete(`/policies/${policyId}`, { data: { acknowledgeEvidenceLoss } }));
