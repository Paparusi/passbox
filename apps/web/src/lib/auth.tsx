'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
}

interface AuthContext {
  user: User | null;
  token: string | null;
  loading: boolean;
  masterKey: Uint8Array | null;
  login: (token: string, user: User, masterKey?: Uint8Array) => void;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const masterKeyRef = useRef<Uint8Array | null>(null);
  const [masterKeyVersion, setMasterKeyVersion] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem('passbox_token');
    const savedUser = localStorage.getItem('passbox_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: User, newMasterKey?: Uint8Array) => {
    localStorage.setItem('passbox_token', newToken);
    localStorage.setItem('passbox_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    if (newMasterKey) {
      masterKeyRef.current = newMasterKey;
      setMasterKeyVersion(v => v + 1);
    }
  };

  const logout = () => {
    localStorage.removeItem('passbox_token');
    localStorage.removeItem('passbox_user');
    // Wipe master key from memory
    if (masterKeyRef.current) {
      masterKeyRef.current.fill(0);
      masterKeyRef.current = null;
    }
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
