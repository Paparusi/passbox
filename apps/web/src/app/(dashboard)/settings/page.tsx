'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';
import {
  deriveMasterKey,
  decryptBytes,
  encryptBytes,
  generateSalt,
  createRecoveryKey,
  fromBase64,
  toBase64,
  getDefaultKdfParams,
  type EncryptedBlob,
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

function CopyBlock({ code }: { code: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
      <code className="text-sm">{code}</code>
      <button
        onClick={copy}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-3 shrink-0"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, token, masterKey, login, logout } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!masterKey) {
      setError('Encryption key not loaded. Please log out and log in again.');
      return;
    }

    setSaving(true);

    try {
      // 1. Fetch current keys to get the encrypted private key
      setSavingMsg('Verifying current password...');
      const keys = await api.getKeys(token!);
      if (!keys) {
        setError('Could not retrieve encryption keys');
        setSaving(false);
        return;
      }

      // 2. Verify current password by deriving old master key and trial decryption
      await new Promise(resolve => setTimeout(resolve, 50));
      const oldSalt = fromBase64(keys.keyDerivationSalt);
      const oldMasterKey = deriveMasterKey(currentPassword, oldSalt, keys.keyDerivationParams);

      const encryptedPrivateKey: EncryptedBlob = JSON.parse(keys.encryptedPrivateKey);
      let privateKey: Uint8Array;
      try {
        privateKey = decryptBytes(encryptedPrivateKey, oldMasterKey);
      } catch {
        oldMasterKey.fill(0);
        setError('Current password is incorrect');
        setSaving(false);
        setSavingMsg('');
        return;
      }

      // 3. Derive new master key
      setSavingMsg('Deriving new encryption key...');
      await new Promise(resolve => setTimeout(resolve, 50));
      const newSalt = generateSalt();
      const kdfParams = getDefaultKdfParams();
      const newMasterKey = deriveMasterKey(newPassword, newSalt, kdfParams);

      // 4. Re-encrypt private key with new master key
      const newEncryptedPrivateKey = encryptBytes(privateKey, newMasterKey);
      privateKey.fill(0);
      oldMasterKey.fill(0);

      // 5. Create new recovery key
      const { recoveryKey: recKey, encryptedMasterKey } = createRecoveryKey(newMasterKey);

      // 6. Send to server
      setSavingMsg('Saving...');
      await api.changePassword({
        newPassword,
        encryptedPrivateKey: JSON.stringify(newEncryptedPrivateKey),
        encryptedMasterKeyRecovery: JSON.stringify(encryptedMasterKey),
        keyDerivationSalt: toBase64(newSalt),
        keyDerivationParams: kdfParams,
      });

      // 7. Update auth context with new master key
      login(token!, user!, newMasterKey);

      // 8. Show new recovery key
      setRecoveryKey(recKey);

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Password changed successfully', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
      setSavingMsg('');
    }
  }

  async function handleDeleteAccount() {
    const ok = await confirm({
      title: 'Delete Account',
      message: 'This will permanently delete your account, all vaults, secrets, and encryption keys. This action cannot be undone.',
      confirmLabel: 'Delete My Account',
      destructive: true,
    });
    if (!ok) return;

    // Double confirmation
    const reallyOk = await confirm({
      title: 'Are you absolutely sure?',
      message: 'All your data will be permanently destroyed. There is no way to recover your account after this.',
      confirmLabel: 'Yes, Delete Everything',
      destructive: true,
    });
    if (!reallyOk) return;

    setDeleting(true);
    try {
      await api.deleteAccount();
      toast('Account deleted', 'success');
      logout();
    } catch (err: any) {
      toast(err.message || 'Failed to delete account', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out? You will need to log in again.',
      confirmLabel: 'Sign Out',
      destructive: true,
    });
    if (ok) logout();
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account settings
        </p>
      </div>

      {/* Account Info */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">User ID</span>
            <span className="text-sm font-mono text-muted-foreground">{user?.id.slice(0, 8)}...</span>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Change Master Password</h2>
        <div className="rounded-xl border border-border bg-card p-5">
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input
              id="current-password"
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={saving}
            />
            <div className="space-y-2">
              <Input
                id="new-password"
                label="New Password"
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={saving}
              />
              {newPassword.length > 0 && (
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
              id="confirm-new-password"
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={saving}
            />

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? savingMsg || 'Saving...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </section>

      {/* API / CLI */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">CLI & SDK</h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Use the PassBox CLI or SDK to manage secrets from your terminal or code.
          </p>
          <CopyBlock code="npm install -g pabox" />
          <CopyBlock code="passbox login" />
          <CopyBlock code="passbox vault list" />
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Sign Out</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Clear your session and return to the login page.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Delete Account</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Permanently delete your account and all data. This cannot be undone.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </section>

      {/* Recovery Key Modal */}
      <Modal
        open={!!recoveryKey}
        onClose={() => setRecoveryKey(null)}
        title="New Recovery Key"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your password has been changed. Here is your <strong>new recovery key</strong>. Save it somewhere safe — your old recovery key no longer works.
          </p>
          <div className="rounded-lg bg-muted border border-border p-4 break-all">
            <code className="text-sm font-mono text-warning">{recoveryKey}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Write this down and store it offline. Do not share it with anyone.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setRecoveryKey(null)}>
              I&apos;ve saved my recovery key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
