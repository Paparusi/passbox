'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { SUPABASE_URL } from '@/lib/utils';
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

type PageState = 'form' | 'recovery' | 'verify-email';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>('form');
  const [registeredEmail, setRegisteredEmail] = useState('');
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
      await api.register(email, password, {
        publicKey: serializePublicKey(keyPair.publicKey),
        encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
        encryptedMasterKeyRecovery: JSON.stringify(encryptedMasterKey),
        keyDerivationSalt: toBase64(salt),
        keyDerivationParams: kdfParams,
      });

      // Wipe master key from memory (user will derive again on login)
      masterKey.fill(0);

      // Show recovery key first
      setRegisteredEmail(email);
      setRecoveryKey(recKey);
      setPageState('recovery');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function handleRecoveryDismiss() {
    setRecoveryKey(null);
    setPageState('verify-email');
  }

  // ─── Verify Email Screen ──────────────────────────
  if (pageState === 'verify-email') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">
              Pass<span className="text-primary">Box</span>
            </h1>
            <p className="text-muted-foreground">Check your email</p>
          </div>

          <div className="rounded-lg bg-success/10 border border-success/20 p-4 space-y-2">
            <p className="text-sm text-success font-medium">Account created successfully!</p>
            <p className="text-sm text-muted-foreground">
              We sent a verification link to <strong className="text-foreground">{registeredEmail}</strong>.
              Please check your inbox and click the link to verify your account.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder.
          </p>

          <Link href="/login">
            <Button className="w-full" size="lg">Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Registration Form ────────────────────────────
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

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const redirectTo = `${window.location.origin}/callback`;
            window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;
          }}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted h-12 px-6 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          Sign up with GitHub
        </button>

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
