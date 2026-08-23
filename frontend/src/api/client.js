import axios from 'axios';

// Both tokens are httpOnly cookies, so this client never reads, stores or
// attaches a token. `withCredentials` is the whole of the auth wiring.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Endpoints that must never trigger a refresh attempt. Retrying a failed
// login as if the session had merely expired would loop.
const NO_RETRY_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

// ---------------------------------------------------------------------------
// Refresh, de-duplicated across the WHOLE app
// ---------------------------------------------------------------------------
// Refresh tokens rotate and the server treats a replayed token as theft: it
// burns the entire session chain. So two overlapping refreshes do not merely
// waste a request, they log the user out.
//
// That happens more easily than it sounds:
//   - several requests 401 together when the 15-minute access cookie expires
//   - React StrictMode double-invokes the mount effect in development, firing
//     the session-restore call twice back to back
//
// Every refresh in the app therefore goes through this one function, which
// collapses concurrent callers onto a single in-flight request. Exported so
// AuthContext's restore-on-mount shares it rather than bypassing it.
let refreshPromise = null;

export const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = client.post('/auth/refresh').finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

// Set by AuthContext so the interceptor can clear app state when the session
// is truly gone. Kept as a callback to avoid importing React state here.
let onSessionExpired = () => {};
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response || response.status !== 401 || !config) return Promise.reject(error);
    if (config._retried) return Promise.reject(error);
    if (NO_RETRY_PATHS.some((path) => config.url?.startsWith(path))) return Promise.reject(error);

    // Only an expired access token is worth retrying. A revoked session, a
    // deactivated account or a bumped tokenVersion will fail again, so the
    // user is sent to the login screen instead.
    const code = response.data?.error?.code;
    if (code && code !== 'ACCESS_TOKEN_EXPIRED') {
      onSessionExpired();
      return Promise.reject(error);
    }

    try {
      await refreshSession();
      config._retried = true;
      return await client(config);
    } catch (refreshError) {
      onSessionExpired();
      return Promise.reject(refreshError);
    }
  }
);

// Unwraps the API's standard envelope into something a component can use
// directly, without every caller repeating the same error-shape handling.
export const unwrap = (promise) =>
  promise.then((res) => res.data.data).catch((error) => {
    const payload = error.response?.data?.error;
    const wrapped = new Error(payload?.message || 'Something went wrong. Please try again.');
    wrapped.code = payload?.code;
    wrapped.details = payload?.details;
    wrapped.status = error.response?.status;
    throw wrapped;
  });

export default client;
