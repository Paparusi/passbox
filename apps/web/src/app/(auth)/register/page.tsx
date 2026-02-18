'use client';

import { useState, useMemo } from 'react';
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

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const strength = useMemo(() => getPasswordStrength(password), [password]);

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

    setLoading(true);

    try {
      // 1. Generate salt and derive master key (CPU-intensive)
      setLoadingMsg('Deriving encryption key...');
      const salt = generateSalt();
      const kdfParams = getDefaultKdfParams();

      // Use setTimeout to allow UI to update before blocking
      await new Promise(resolve => setTimeout(resolve, 50));
      const masterKey = deriveMasterKey(password, salt, kdfParams);

      // 2. Generate X25519 key pair
      setLoadingMsg('Generating key pair...');
      const keyPair = generateKeyPair();

      // 3. Encrypt private key with master key
      const encryptedPrivateKey = encryptBytes(keyPair.privateKey, masterKey);

      // 4. Create recovery key
      const { recoveryKey: recKey, encryptedMasterKey } = createRecoveryKey(masterKey);

      // 5. Register on server
      setLoadingMsg('Creating account...');
      const data = await api.register(email, password, {
        publicKey: serializePublicKey(keyPair.publicKey),
        encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
        encryptedMasterKeyRecovery: JSON.stringify(encryptedMasterKey),
        keyDerivationSalt: toBase64(salt),
        keyDerivationParams: kdfParams,
      });

      if (data.session) {
        login(data.session.accessToken, data.user, masterKey);
        // Show recovery key before navigating
        setRecoveryKey(recKey);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function handleRecoveryDismiss() {
    setRecoveryKey(null);
    router.push('/vaults');
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            Pass<span className="text-primary">Box</span>
          </h1>
          <p className="text-muted-foreground">Create your account</p>
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
          <div className="space-y-2">
            <Input
              id="password"
              label="Master Password"
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
            {loading ? loadingMsg || 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
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
            This recovery key is the <strong>only way</strong> to recover your account if you forget your master password. Save it somewhere safe — it will <strong>not be shown again</strong>.
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
