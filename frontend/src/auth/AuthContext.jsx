import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import * as authApi from '../api/auth';
import { setSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

// Nothing about the session is persisted here. Both tokens are httpOnly
// cookies the browser holds and JavaScript cannot read, so there is no token
// in state, no token in localStorage, and nothing for an XSS payload to steal.
// The user profile below is display data only - every authorisation decision
// is made server-side.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [capabilities, setCapabilities] = useState([]);
  // `restoring` covers the initial silent-refresh. Rendering routes before it
  // settles would flash the login page on every reload.
  const [restoring, setRestoring] = useState(true);

  const applySession = useCallback((data) => {
    setUser(data.user);
    setCapabilities(data.capabilities || []);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setCapabilities([]);
  }, []);

  // The axios interceptor calls this when a refresh fails, so a session
  // revoked server-side (deactivation, tokenVersion bump) also clears the UI.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
  }, [clearSession]);

  // On mount, ask the API whether the refresh cookie still identifies a valid
  // session. A 401 here is the normal "not logged in" case, not an error.
  useEffect(() => {
    let cancelled = false;

    authApi
      .restoreSession()
      .then((data) => {
        if (!cancelled) applySession(data);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const login = useCallback(
    async (employeeId, password) => {
      const data = await authApi.login(employeeId, password);
      applySession(data);
      return data;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    // Clear locally even if the network call fails - the user asked to leave,
    // so the UI must not keep showing them as signed in.
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const data = await authApi.changePassword(currentPassword, newPassword);
      applySession(data);
      return data;
    },
    [applySession]
  );

  // Mirrors the server's capability list. This drives which controls are
  // RENDERED; it is not a security boundary (NFR-SEC-03).
  const can = useCallback((capability) => capabilities.includes(capability), [capabilities]);

  const value = useMemo(
    () => ({
      user,
      capabilities,
      restoring,
      isAuthenticated: !!user,
      mustChangePassword: !!user?.mustChangePassword,
      login,
      logout,
      changePassword,
      can,
    }),
    [user, capabilities, restoring, login, logout, changePassword, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
};
