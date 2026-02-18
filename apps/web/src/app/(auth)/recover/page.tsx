'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
  decryptMasterKeyWithRecovery,
  deriveMasterKey,
  generateSalt,
  encryptBytes,
  createRecoveryKey,
  getDefaultKdfParams,
  toBase64,
  type EncryptedBlob,
} from '@/lib/crypto';

type Step = 'email' | 'recovery' | 'password' | 'done';

export default function RecoverPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);

  // Data from server
  const [recoveryData, setRecoveryData] = useState<{
    encryptedMasterKeyRecovery: string;
    encryptedPrivateKey: string;
    publicKey: string;
  } | null>(null);

  const router = useRouter();

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)) score++;
    if (/\d/.test(newPassword)) score++;
    if (/[^a-zA-Z0-9]/.test(newPassword)) score++;
    if (score <= 1) return { score, label: 'Weak', color: 'bg-destructive' };
    if (score <= 2) return { score, label: 'Fair', color: 'bg-warning' };
    if (score <= 3) return { score, label: 'Good', color: 'bg-primary' };
    return { score, label: 'Strong', color: 'bg-success' };
  }, [newPassword]);

  // Step 1: Fetch recovery info by email
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.getRecoveryInfo(email);
      setRecoveryData(data);
      setStep('recovery');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch recovery info');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify recovery key by attempting decryption
  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!recoveryData) throw new Error('No recovery data');

      setLoadingMsg('Verifying recovery key...');
      await new Promise(resolve => setTimeout(resolve, 50));

      const encryptedMasterKey: EncryptedBlob = JSON.parse(recoveryData.encryptedMasterKeyRecovery);
      // This will throw if recovery key is wrong
      decryptMasterKeyWithRecovery(encryptedMasterKey, recoveryKeyInput.trim());

      setStep('password');
    } catch {
      setError('Invalid recovery key. Please check and try again.');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  // Step 3: Set new password and re-encrypt everything
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain a lowercase letter, uppercase letter, and number');
      return;
    }

    setLoading(true);

    try {
      if (!recoveryData) throw new Error('No recovery data');

      // 1. Decrypt master key with recovery key
      setLoadingMsg('Decrypting master key...');
      await new Promise(resolve => setTimeout(resolve, 50));

      const encryptedMasterKey: EncryptedBlob = JSON.parse(recoveryData.encryptedMasterKeyRecovery);
      const oldMasterKey = decryptMasterKeyWithRecovery(encryptedMasterKey, recoveryKeyInput.trim());

      // 2. Decrypt the private key with old master key
      const encryptedPrivateKey: EncryptedBlob = JSON.parse(recoveryData.encryptedPrivateKey);
      const { decryptBytes } = await import('@/lib/crypto');
      const privateKey = decryptBytes(encryptedPrivateKey, oldMasterKey);

      // 3. Derive new master key from new password
      setLoadingMsg('Deriving new encryption key...');
      await new Promise(resolve => setTimeout(resolve, 50));

      const newSalt = generateSalt();
      const kdfParams = getDefaultKdfParams();
      const newMasterKey = deriveMasterKey(newPassword, newSalt, kdfParams);

      // 4. Re-encrypt private key with new master key
      const newEncryptedPrivateKey = encryptBytes(privateKey, newMasterKey);

      // 5. Create new recovery key
      const { recoveryKey: recKey, encryptedMasterKey: newEncMK } = createRecoveryKey(newMasterKey);

      // 6. Submit to server
      setLoadingMsg('Updating account...');
      await api.recoverAccount({
        email,
        newPassword,
        encryptedPrivateKey: JSON.stringify(newEncryptedPrivateKey),
        encryptedMasterKeyRecovery: JSON.stringify(newEncMK),
        keyDerivationSalt: toBase64(newSalt),
        keyDerivationParams: kdfParams,
      });

      // Zero-fill old master key
      oldMasterKey.fill(0);
      newMasterKey.fill(0);
      privateKey.fill(0);

      setNewRecoveryKey(recKey);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Recovery failed');
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
          <p className="text-muted-foreground">Account Recovery</p>
        </div>

        {/* Step indicators */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-2">
            {['email', 'recovery', 'password'].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${
                  s === step ? 'bg-primary' :
                  ['email', 'recovery', 'password'].indexOf(step) > i ? 'bg-primary/50' : 'bg-border'
                }`} />
                {i < 2 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the email associated with your account to begin recovery.
            </p>
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
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Looking up...' : 'Continue'}
            </Button>
          </form>
        )}

        {/* Step 2: Recovery Key */}
        {step === 'recovery' && (
          <form onSubmit={handleRecoverySubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the recovery key you saved when you created your account.
            </p>
            <Input
              id="recovery-key"
              label="Recovery Key"
              type="text"
              placeholder="Paste your recovery key"
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
              required
              disabled={loading}
            />
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={() => { setStep('email'); setError(''); }} disabled={loading}>
                Back
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={loading || !recoveryKeyInput.trim()}>
                {loading ? loadingMsg || 'Verifying...' : 'Verify Key'}
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: New Password */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Set a new master password for your account.
            </p>
            <div className="space-y-2">
              <Input
                id="new-password"
                label="New Master Password"
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={loading}
              />
              {newPassword.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= passwordStrength.score ? passwordStrength.color : 'bg-border'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{passwordStrength.label}</p>
                </div>
              )}
            </div>
            <Input
              id="confirm-password"
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
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={() => { setStep('recovery'); setError(''); }} disabled={loading}>
                Back
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={loading}>
                {loading ? loadingMsg || 'Recovering...' : 'Reset Password'}
              </Button>
            </div>
          </form>
        )}

        {/* Step 4: Done — Show New Recovery Key */}
        {step === 'done' && newRecoveryKey && (
          <div className="space-y-4">
            <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-sm text-success">
              Account recovered successfully!
            </div>
            <p className="text-sm text-muted-foreground">
              A <strong>new recovery key</strong> has been generated. Save it somewhere safe — it will <strong>not be shown again</strong>.
            </p>
            <div className="rounded-lg bg-muted border border-border p-4 break-all">
              <code className="text-sm font-mono text-warning">{newRecoveryKey}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              Your old recovery key is no longer valid.
            </p>
            <Button className="w-full" size="lg" onClick={() => router.push('/login')}>
              I&apos;ve saved my key — Go to Login
            </Button>
          </div>
        )}

        {step !== 'done' && (
          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
