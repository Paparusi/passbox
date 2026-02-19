'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  plan: string;
  planStatus: string;
  vaultCount: number;
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

export default function AdminUsersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [changingUser, setChangingUser] = useState<AdminUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [saving, setSaving] = useState(false);

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
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">EMAIL</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">PLAN</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">VAULTS</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">CREATED</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">LAST ACTIVE</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm">{user.email}</td>
                    <td className="px-4 py-3"><PlanBadge plan={user.plan} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{user.vaultCount}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{timeAgo(user.lastSignIn)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openPlanChange(user)}>
                        Change Plan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{user.email}</span>
                    <PlanBadge plan={user.plan} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{user.vaultCount} vaults | Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                    <Button variant="ghost" size="sm" onClick={() => openPlanChange(user)}>
                      Change Plan
                    </Button>
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
