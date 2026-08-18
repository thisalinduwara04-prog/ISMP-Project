import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { ROLES, COMPLIANCE_VIEWER_ROLES } from '../constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('ispm_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ispm_token');
    if (!token) {
      setLoading(false);
      return;
    }
    // Re-validate the stored session against the API on load so a revoked
    // or expired token doesn't leave stale user info in the UI.
    authApi
      .getMe()
      .then(({ user: freshUser }) => {
        setUser(freshUser);
        localStorage.setItem('ispm_user', JSON.stringify(freshUser));
      })
      .catch(() => {
        localStorage.removeItem('ispm_token');
        localStorage.removeItem('ispm_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (employeeId, password) => {
    const { token, user: loggedInUser } = await authApi.login(employeeId, password);
    localStorage.setItem('ispm_token', token);
    localStorage.setItem('ispm_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: newUser } = await authApi.register(payload);
    localStorage.setItem('ispm_token', token);
    localStorage.setItem('ispm_user', JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ispm_token');
    localStorage.removeItem('ispm_user');
    setUser(null);
  }, []);

  const isAdmin = user?.role === ROLES.ADMIN;
  const canViewCompliance = user && COMPLIANCE_VIEWER_ROLES.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin, canViewCompliance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
