import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, setAccessToken, setUnauthorizedHandler } from '../api/client';
import { AuthUser } from '../types';

interface LoginResult {
  requiresTwoFactor?: boolean;
  tempToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<LoginResult>;
  verifyTwoFactor: (tempToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity auto-logout
const IDLE_WARNING_MS = 28 * 60 * 1000; // warn 2 minutes before

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* best-effort */
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (!user) return;
    warnTimer.current = setTimeout(() => {
      console.info('Session will expire soon due to inactivity.');
    }, IDLE_WARNING_MS);
    idleTimer.current = setTimeout(() => {
      logout();
      setSessionExpired(true);
    }, IDLE_TIMEOUT_MS);
  }, [user, logout]);

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
    };
  }, [user, resetIdleTimer]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setAccessToken(null);
      setSessionExpired(true);
    });
    (async () => {
      try {
        const res = await api.post('/auth/refresh');
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (identifier: string, password: string, rememberMe: boolean): Promise<LoginResult> => {
    const res = await api.post('/auth/login', { identifier, password, rememberMe });
    if (res.data.requiresTwoFactor) {
      return { requiresTwoFactor: true, tempToken: res.data.tempToken };
    }
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setSessionExpired(false);
    return {};
  }, []);

  const verifyTwoFactor = useCallback(async (tempToken: string, code: string) => {
    const res = await api.post('/auth/2fa/verify', { tempToken, code });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setSessionExpired(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, verifyTwoFactor, logout, refreshUser, sessionExpired, dismissSessionExpired: () => setSessionExpired(false) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { apiErrorMessage };
