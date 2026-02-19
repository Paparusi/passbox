'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  provider: string;
  emailVerified: boolean;
  plan: string;
  planStatus: string;
  vaultCount: number;
  secretCount: number;
  tokenCount: number;
  createdAt: string;
  lastSignIn: string | null;
}

const PLAN_OPTIONS = ['free', 'pro', 'team', 'enterprise'];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    pro: 'bg-primary/20 text-primary',
    team: 'bg-success/20 text-success',
    enterprise: 'bg-warning/20 text-warning',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[plan] || 'bg-muted text-muted-foreground'}`}>
      {plan}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const isGitHub = provider === 'github';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${isGitHub ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'}`}>
      {isGitHub ? 'GitHub' : 'Email'}
    </span>
  );
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [changingUser, setChangingUser] = useState<AdminUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadUsers(p: number) {
    setLoading(true);
    try {
      const data = await api.adminGetUsers({ page: p, perPage: 25 });
      setUsers(data.users);
      setPage(data.page);
      setHasMore(data.hasMore);
    } catch (err: any) {
      if (err.message?.includes('FORBIDDEN')) {
        toast('Access denied', 'error');
        router.push('/vaults');
        return;
      }
      toast(err.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(1); }, []);

  function openPlanChange(user: AdminUser) {
    setChangingUser(user);
    setSelectedPlan(user.plan);
  }

  async function handlePlanChange() {
    if (!changingUser) return;
    setSaving(true);
    try {
      await api.adminChangeUserPlan(changingUser.id, selectedPlan);
      toast(`Plan changed to ${selectedPlan} for ${changingUser.email}`, 'success');
      setChangingUser(null);
      await loadUsers(page);
    } catch (err: any) {
      toast(err.message || 'Failed to change plan', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    const ok = await confirm({
      title: 'Delete User',
      message: `Permanently delete ${user.email}? This will remove all their vaults, secrets, and data. This action cannot be undone.`,
      confirmLabel: 'Delete User',
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(user.id);
    try {
      await api.adminDeleteUser(user.id);
      toast(`Deleted ${user.email}`, 'success');
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      toast(err.message || 'Failed to delete user', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage all platform users</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <h3 className="text-lg font-semibold mb-2">No users found</h3>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">USER</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">PROVIDER</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">PLAN</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">VAULTS</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">SECRETS</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">TOKENS</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">LAST ACTIVE</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {new Date(user.createdAt).toLocaleDateString()}
                            {!user.emailVerified && ' (unverified)'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3"><ProviderBadge provider={user.provider} /></td>
                      <td className="px-4 py-3"><PlanBadge plan={user.plan} /></td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{user.vaultCount}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{user.secretCount}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{user.tokenCount}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{timeAgo(user.lastSignIn)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openPlanChange(user)}>
                            Plan
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                            disabled={deletingId === user.id}
                            className="text-destructive hover:text-destructive"
                          >
                            {deletingId === user.id ? '...' : 'Delete'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{user.email}</span>
                    <div className="flex items-center gap-1">
                      <ProviderBadge provider={user.provider} />
                      <PlanBadge plan={user.plan} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {user.vaultCount} vaults, {user.secretCount} secrets, {user.tokenCount} tokens
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Joined {new Date(user.createdAt).toLocaleDateString()} | Active {timeAgo(user.lastSignIn)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openPlanChange(user)}>
                        Plan
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUser(user)}
                        disabled={deletingId === user.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {deletingId === user.id ? '...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => loadUsers(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => loadUsers(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}

      {/* Change Plan Modal */}
      <Modal open={!!changingUser} onClose={() => setChangingUser(null)} title="Change User Plan">
        {changingUser && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Changing plan for <span className="font-medium text-foreground">{changingUser.email}</span>
            </p>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PLAN_OPTIONS.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setChangingUser(null)}>Cancel</Button>
              <Button onClick={handlePlanChange} disabled={saving || selectedPlan === changingUser.plan}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
