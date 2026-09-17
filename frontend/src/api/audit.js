import client, { unwrap } from './client';

// M1 audit log, read only (spec section 8.7). The collection is append-only, so
// there is nothing here but reads - no create, no edit, no delete anywhere in
// the system (AD-4).

export const fetchAuditLogs = (params = {}) => unwrap(client.get('/audit-logs', { params }));

// The values actually present in the log, for the filter dropdowns. Taken from
// the data rather than from a hard-coded list, so actions written by parts of
// the system this build does not know about still appear.
export const fetchAuditFilters = () => unwrap(client.get('/audit-logs/filters'));
