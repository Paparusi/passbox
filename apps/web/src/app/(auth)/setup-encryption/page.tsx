'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  deriveMasterKey,
  generateSalt,
  generateKeyPair,
  encryptBytes,
  createRecoveryKey,
  serializePublicKey,
  toBase64,
  getDefaultKdfParams,
} from '@/lib/crypto';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-destructive' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-warning' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-primary' };
  return { score, label: 'Strong', color: 'bg-success' };
}

export default function SetupEncryptionPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [oauthUser, setOauthUser] = useState<{ id: string; email: string } | null>(null);

  const { login } = useAuth();
  const router = useRouter();
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    const token = sessionStorage.getItem('passbox_oauth_token');
    const userStr = sessionStorage.getItem('passbox_oauth_user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    setOauthToken(token);
    setOauthUser(JSON.parse(userStr));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!oauthToken || !oauthUser) {
      setError('Session expired. Please sign in again.');
      return;
    }

    setLoading(true);

    try {
      // 1. Generate salt and derive master key
      setLoadingMsg('Deriving encryption key...');
      const salt = generateSalt();
      const kdfParams = getDefaultKdfParams();
      await new Promise(resolve => setTimeout(resolve, 50));
      const masterKey = deriveMasterKey(password, salt, kdfParams);

      // 2. Generate X25519 key pair
      setLoadingMsg('Generating key pair...');
      const keyPair = generateKeyPair();

      // 3. Encrypt private key with master key
      const encryptedPrivateKey = encryptBytes(keyPair.privateKey, masterKey);

      // 4. Create recovery key
      const { recoveryKey: recKey, encryptedMasterKey } = createRecoveryKey(masterKey);

      // 5. Send keys to server
      setLoadingMsg('Setting up encryption...');
      await api.setupKeys(oauthToken, {
        publicKey: serializePublicKey(keyPair.publicKey),
        encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
        encryptedMasterKeyRecovery: JSON.stringify(encryptedMasterKey),
        keyDerivationSalt: toBase64(salt),
        keyDerivationParams: kdfParams,
      });

      // 6. Store session
      login(oauthToken, oauthUser, masterKey);

      // Clean up temp storage
      sessionStorage.removeItem('passbox_oauth_token');
      sessionStorage.removeItem('passbox_oauth_user');

      // Show recovery key
      setRecoveryKey(recKey);
    } catch (err: any) {
      setError(err.message || 'Failed to set up encryption');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function handleRecoveryDismiss() {
    setRecoveryKey(null);
    router.push('/vaults');
  }

  if (!oauthUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            Pass<span className="text-primary">Box</span>
          </h1>
          <p className="text-muted-foreground">Set Up Encryption</p>
        </div>

        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm text-muted-foreground">
          Welcome, <strong>{oauthUser.email}</strong>! PassBox uses zero-knowledge encryption.
          Set an encryption password to protect your secrets. This is separate from your GitHub account.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              id="password"
              label="Encryption Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={loading}
            />
            {password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength.score ? strength.color : 'bg-border'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{strength.label}</p>
              </div>
            )}
          </div>
          <Input
            id="confirm"
            label="Confirm Password"
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? loadingMsg || 'Setting up...' : 'Set Up Encryption'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Use a different account
          </Link>
        </p>
      </div>

      {/* Recovery Key Modal */}
      <Modal
        open={!!recoveryKey}
        onClose={handleRecoveryDismiss}
        title="Save Your Recovery Key"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This recovery key is the <strong>only way</strong> to recover your account if you forget your encryption password. Save it somewhere safe — it will <strong>not be shown again</strong>.
          </p>
          <div className="rounded-lg bg-muted border border-border p-4 break-all">
            <code className="text-sm font-mono text-warning">{recoveryKey}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Write this down and store it offline. Do not share it with anyone.
          </p>
          <div className="flex justify-end">
            <Button onClick={handleRecoveryDismiss}>
              I&apos;ve saved my recovery key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
