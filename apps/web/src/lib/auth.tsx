'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from './utils';

interface User {
  id: string;
  email: string;
  emailVerified?: boolean;
}

interface AuthContext {
  user: User | null;
  token: string | null;
  loading: boolean;
  masterKey: Uint8Array | null;
  login: (token: string, user: User, masterKey?: Uint8Array, refreshToken?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  token: null,
  loading: true,
  masterKey: null,
  login: () => {},
  logout: () => {},
});

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes (refresh before 1h expiry)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const masterKeyRef = useRef<Uint8Array | null>(null);
  const [masterKeyVersion, setMasterKeyVersion] = useState(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialRefreshDone = useRef(false);
  const router = useRouter();

  // Wipe master key from memory (zero-fill then null)
  const wipeMasterKey = useCallback(() => {
    if (masterKeyRef.current) {
      masterKeyRef.current.fill(0);
      masterKeyRef.current = null;
      setMasterKeyVersion(v => v + 1);
    }
  }, []);

  // Reset idle timer on user activity
  const resetIdleTimer = useCallback(() => {
    if (!masterKeyRef.current) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      wipeMasterKey();
    }, IDLE_TIMEOUT_MS);
  }, [wipeMasterKey]);

  // Refresh the access token using the refresh token
  const refreshAccessToken = useCallback(async () => {
    const refreshToken = sessionStorage.getItem('passbox_refresh_token');
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        sessionStorage.setItem('passbox_token', data.data.accessToken);
        sessionStorage.setItem('passbox_refresh_token', data.data.refreshToken);
        // Don't call setToken() here — it would re-trigger the useEffect
        // and create a refresh loop. The API client reads from sessionStorage directly.
        return true;
      }
    } catch {
      // Silent fail — next request will 401 and trigger retry
    }
    return false;
  }, []);

  // Load saved session
  useEffect(() => {
    const savedToken = sessionStorage.getItem('passbox_token');
    const savedUser = sessionStorage.getItem('passbox_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  // Auto-refresh token on an interval
  useEffect(() => {
    if (!token) {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      initialRefreshDone.current = false;
      return;
    }

    // Refresh once on initial load (token might be stale after page reload)
    if (!initialRefreshDone.current) {
      initialRefreshDone.current = true;
      const savedRefresh = sessionStorage.getItem('passbox_refresh_token');
      if (savedRefresh) {
        refreshAccessToken();
      }
    }

    refreshTimerRef.current = setInterval(refreshAccessToken, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [token, refreshAccessToken]);

  // beforeunload: wipe master key when tab closes
  useEffect(() => {
    const handleUnload = () => {
      wipeMasterKey();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [wipeMasterKey]);

  // Idle timeout: wipe master key after 30 min of no activity
  useEffect(() => {
    if (!masterKeyRef.current) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetIdleTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer(); // Start the timer

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [masterKeyVersion, resetIdleTimer]);

  const login = (newToken: string, newUser: User, newMasterKey?: Uint8Array, refreshToken?: string) => {
    sessionStorage.setItem('passbox_token', newToken);
    sessionStorage.setItem('passbox_user', JSON.stringify(newUser));
    if (refreshToken) {
      sessionStorage.setItem('passbox_refresh_token', refreshToken);
    }
    setToken(newToken);
    setUser(newUser);
    if (newMasterKey) {
      masterKeyRef.current = newMasterKey;
      setMasterKeyVersion(v => v + 1);
    }
  };

  const logout = () => {
    sessionStorage.removeItem('passbox_token');
    sessionStorage.removeItem('passbox_user');
    sessionStorage.removeItem('passbox_refresh_token');
    wipeMasterKey();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    setToken(null);
    setUser(null);
    setMasterKeyVersion(0);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      masterKey: masterKeyRef.current,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
