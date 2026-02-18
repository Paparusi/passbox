'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { deriveMasterKey, fromBase64 } from '@/lib/crypto';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      setLoadingMsg('Authenticating...');
      const data = await api.login(email, password);

      let masterKey: Uint8Array | undefined;

      // Derive master key if server returned key params
      if (data.keys) {
        setLoadingMsg('Deriving encryption key...');
        await new Promise(resolve => setTimeout(resolve, 50));
        const salt = fromBase64(data.keys.keyDerivationSalt);
        masterKey = deriveMasterKey(password, salt, data.keys.keyDerivationParams);
      }

      login(data.session.accessToken, data.user, masterKey);
      router.push('/vaults');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            Pass<span className="text-primary">Box</span>
          </h1>
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={loading}
          />
          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="Your master password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
          />

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? loadingMsg || 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">
            <Link href="/recover" className="text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
