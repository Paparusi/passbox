'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      // Password change will re-encrypt all keys — not yet implemented
      setSuccess('Password change is not yet available. Coming soon.');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
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
              required
            />
            <Input
              id="new-password"
              label="New Password"
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              id="confirm-new-password"
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm text-primary">
                {success}
              </div>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Update Password'}
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
          <div className="rounded-lg bg-muted p-3">
            <code className="text-sm">npm install -g pabox</code>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <code className="text-sm">passbox login</code>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-medium">Sign Out</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Clear your session and return to the login page.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </section>
    </div>
  );
}
