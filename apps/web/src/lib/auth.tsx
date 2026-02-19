'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from './utils';
import { deriveMasterKey, decryptBytes, fromBase64, type EncryptedBlob } from './crypto';

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
  /** Prompt user for encryption password if masterKey is null. Returns the key or null if cancelled. */
  requestUnlock: () => Promise<Uint8Array | null>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  token: null,
  loading: true,
  masterKey: null,
  login: () => {},
  logout: () => {},
  requestUnlock: () => Promise.resolve(null),
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

  // Unlock modal state
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const unlockResolverRef = useRef<((key: Uint8Array | null) => void) | null>(null);

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

  // Request unlock: show modal to re-enter encryption password
  const requestUnlock = useCallback((): Promise<Uint8Array | null> => {
    // If masterKey already exists, return it
    if (masterKeyRef.current) return Promise.resolve(masterKeyRef.current);

    // Show the unlock modal and wait for user input
    return new Promise((resolve) => {
      unlockResolverRef.current = resolve;
      setUnlockPassword('');
      setUnlockError('');
      setUnlockOpen(true);
    });
  }, []);

  const handleUnlockCancel = useCallback(() => {
    setUnlockOpen(false);
    setUnlockPassword('');
    setUnlockError('');
    if (unlockResolverRef.current) {
      unlockResolverRef.current(null);
      unlockResolverRef.current = null;
    }
  }, []);

  const handleUnlockSubmit = useCallback(async (password: string) => {
    setUnlockLoading(true);
    setUnlockError('');

    try {
      // Fetch KDF params from server
      const token = sessionStorage.getItem('passbox_token');
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`${API_URL}/api/v1/auth/keys`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch encryption keys');
      const data = await res.json();
      if (!data.success || !data.data) throw new Error('No encryption keys found');

      const keys = data.data as {
        publicKey: string;
        encryptedPrivateKey: string;
        keyDerivationSalt: string;
        keyDerivationParams: { iterations: number; memory: number; parallelism: number };
      };

      // Derive master key from password
      const salt = fromBase64(keys.keyDerivationSalt);
      const mk = deriveMasterKey(password, salt, keys.keyDerivationParams);

      // Verify by decrypting the private key
      const encPrivKey: EncryptedBlob = JSON.parse(keys.encryptedPrivateKey);
      decryptBytes(encPrivKey, mk); // Throws if wrong password (tag mismatch)

      // Success — store and resolve
      masterKeyRef.current = mk;
      setMasterKeyVersion(v => v + 1);
      setUnlockOpen(false);
      setUnlockPassword('');
      if (unlockResolverRef.current) {
        unlockResolverRef.current(mk);
        unlockResolverRef.current = null;
      }
    } catch {
      setUnlockError('Wrong password. Please try again.');
    } finally {
      setUnlockLoading(false);
    }
  }, []);

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
      requestUnlock,
    }}>
      {children}

      {/* Unlock Modal — re-enter encryption password */}
      {unlockOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleUnlockCancel(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-lg font-semibold mb-2">Vault Locked</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your encryption key has expired. Enter your master password to unlock.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); handleUnlockSubmit(unlockPassword); }} className="space-y-4">
              <div>
                <label htmlFor="unlock-password" className="block text-sm font-medium mb-1.5">
                  Master Password
                </label>
                <input
                  id="unlock-password"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  disabled={unlockLoading}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  placeholder="Enter your master password"
                />
              </div>
              {unlockError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {unlockError}
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleUnlockCancel}
                  disabled={unlockLoading}
                  className="px-4 h-9 text-sm rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading || !unlockPassword}
                  className="px-4 h-9 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {unlockLoading ? 'Unlocking...' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
