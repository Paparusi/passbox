'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { deriveMasterKey, decryptBytes, fromBase64, type EncryptedBlob } from '@/lib/crypto';

function parseJwtPayload(token: string): { sub: string; email: string } {
  const payload = token.split('.')[1];
  // Handle base64url encoding
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

type CallbackState = 'loading' | 'unlock' | 'error';

export default function OAuthCallbackPage() {
  const [state, setState] = useState<CallbackState>('loading');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [keys, setKeys] = useState<{
    publicKey: string;
    encryptedPrivateKey: string;
    encryptedMasterKeyRecovery: string;
    keyDerivationSalt: string;
    keyDerivationParams: { iterations: number; memory: number; parallelism: number };
  } | null>(null);
  const [tokenData, setTokenData] = useState<{
    accessToken: string;
    user: { id: string; email: string };
  } | null>(null);

  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      // Parse tokens from URL hash (Supabase puts them in the fragment)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');

      if (!accessToken) {
        setError('No access token found. Please try signing in again.');
        setState('error');
        return;
      }

      // Decode JWT to get user info
      const payload = parseJwtPayload(accessToken);
      const user = { id: payload.sub, email: payload.email };
      setTokenData({ accessToken, user });

      // Check if user has encryption keys
      const userKeys = await api.getKeys(accessToken);

      if (!userKeys) {
        // New OAuth user — needs to set up encryption
        sessionStorage.setItem('passbox_oauth_token', accessToken);
        sessionStorage.setItem('passbox_oauth_user', JSON.stringify(user));
        router.push('/setup-encryption');
        return;
      }

      // Returning user — needs to enter encryption password
      setKeys(userKeys);
      setState('unlock');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
      setState('error');
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenData || !keys) return;
    setError('');
    setUnlocking(true);

    try {
      setLoadingMsg('Deriving encryption key...');
      await new Promise(resolve => setTimeout(resolve, 50));

      const salt = fromBase64(keys.keyDerivationSalt);
      const masterKey = deriveMasterKey(password, salt, keys.keyDerivationParams);

      // Validate by trial decryption of the private key
      const encryptedPrivateKey: EncryptedBlob = JSON.parse(keys.encryptedPrivateKey);
      try {
        decryptBytes(encryptedPrivateKey, masterKey);
      } catch {
        masterKey.fill(0);
        setError('Incorrect encryption password. Please try again.');
        setUnlocking(false);
        setLoadingMsg('');
        return;
      }

      login(tokenData.accessToken, tokenData.user, masterKey);
      router.push('/vaults');
    } catch (err: any) {
      setError('Failed to unlock. Please try again.');
    } finally {
      setUnlocking(false);
      setLoadingMsg('');
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground text-sm">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">
              Pass<span className="text-primary">Box</span>
            </h1>
            <p className="text-muted-foreground">Authentication Error</p>
          </div>
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
          <Link href="/login">
            <Button className="w-full" size="lg">Back to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  // state === 'unlock'
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            Pass<span className="text-primary">Box</span>
          </h1>
          <p className="text-muted-foreground">Unlock Your Vault</p>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Welcome back, <strong>{tokenData?.user.email}</strong>. Enter your encryption password to access your secrets.
        </p>

        <form onSubmit={handleUnlock} className="space-y-4">
          <Input
            id="encryption-password"
            label="Encryption Password"
            type="password"
            placeholder="Your encryption password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            disabled={unlocking}
          />

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={unlocking}>
            {unlocking ? loadingMsg || 'Unlocking...' : 'Unlock'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Use a different account
          </Link>
        </p>
      </div>
    </div>
  );
}
