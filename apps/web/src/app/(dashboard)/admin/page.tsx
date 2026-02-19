'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

interface Stats {
  totalUsers: number;
  totalVaults: number;
  totalSecrets: number;
  totalOrgs: number;
  waitlistCount: number;
  totalServiceTokens: number;
  totalAuditLogs: number;
  totalVaultMembers: number;
  totalSecretVersions: number;
  recentSignups: number;
  subscriptions: Record<string, number>;
}

interface Revenue {
  configured: boolean;
  balance: { available: number; pending: number; currency: string };
  mrr: number;
  totalRevenue: number;
  activeSubscriptions?: number;
  recentCharges: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    customerEmail: string;
    created: string;
  }>;
}

interface ActivityLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId: string;
  userEmail: string | null;
  metadata: any;
  createdAt: string;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border rounded-xl p-5 space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function timeAgo(dateStr: string): string {
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

function formatAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AdminOverviewPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        await api.adminCheck();
        const [statsData, revenueData, activityData] = await Promise.all([
          api.adminGetStats(),
          api.adminGetRevenue(),
          api.adminGetActivity({ limit: 15 }),
        ]);
        setStats(statsData);
        setRevenue(revenueData);
        setActivity(activityData);
      } catch (err: any) {
        if (err.message?.includes('permissions') || err.message?.includes('FORBIDDEN')) {
          toast('Access denied. Admin privileges required.', 'error');
          router.push('/vaults');
          return;
        }
        toast(err.message || 'Failed to load stats', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!stats) return null;

  const totalActiveSubs = Object.values(stats.subscriptions).reduce((a, b) => a + b, 0);
  const cur = revenue?.balance.currency || 'usd';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Platform overview and management
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          Manage Users
        </Link>
        <span className="text-muted-foreground">|</span>
        <Link href="/admin/waitlist" className="text-sm text-primary hover:underline">
          Manage Waitlist
        </Link>
      </div>

      {/* Revenue Section */}
      {revenue && (
        <div className="border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Revenue</h2>
            {!revenue.configured && (
              <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded-full">
                Stripe not configured
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">MRR</p>
              <p className="text-2xl font-bold text-success">{formatCurrency(revenue.mrr, cur)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Revenue (30d)</p>
              <p className="text-2xl font-bold">{formatCurrency(revenue.totalRevenue, cur)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Balance Available</p>
              <p className="text-2xl font-bold">{formatCurrency(revenue.balance.available, cur)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(revenue.balance.pending, cur)}</p>
            </div>
          </div>

          {/* Recent Charges */}
          {revenue.recentCharges.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Transactions</h3>
              <div className="space-y-2">
                {revenue.recentCharges.map(charge => (
                  <div key={charge.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        charge.status === 'succeeded' ? 'bg-success' : charge.status === 'pending' ? 'bg-warning' : 'bg-destructive'
                      }`} />
                      <span className="truncate">{charge.customerEmail || charge.description || charge.id.slice(-8)}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-medium">{formatCurrency(charge.amount, charge.currency)}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(charge.created)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Total Vaults" value={stats.totalVaults} />
        <StatCard label="Total Secrets" value={stats.totalSecrets} />
        <StatCard label="Organizations" value={stats.totalOrgs} />
        <StatCard label="Waitlist" value={stats.waitlistCount} />
        <StatCard label="Active Subscriptions" value={totalActiveSubs} />
        <StatCard label="Signups (7d)" value={stats.recentSignups} />
        <StatCard label="Service Tokens" value={stats.totalServiceTokens} />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Vault Members" value={stats.totalVaultMembers} />
        <StatCard label="Secret Versions" value={stats.totalSecretVersions} />
        <StatCard label="Audit Logs" value={stats.totalAuditLogs} />
        <StatCard label="Avg Secrets/Vault" value={stats.totalVaults > 0 ? Math.round(stats.totalSecrets / stats.totalVaults) : 0} />
      </div>

      {/* Subscriptions by Plan */}
      <div className="border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Subscriptions by Plan</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['free', 'pro', 'team', 'enterprise'] as const).map(plan => (
            <div key={plan} className="space-y-1">
              <p className="text-sm text-muted-foreground capitalize">{plan}</p>
              <p className="text-xl font-bold">{stats.subscriptions[plan] || 0}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <p className="text-xs text-muted-foreground mt-1">Last 15 platform events</p>
        </div>
        {activity.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground text-sm">
            No activity recorded yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activity.map(log => (
              <div key={log.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{formatAction(log.action)}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {log.resourceType}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {log.userEmail || log.userId.slice(0, 8) + '...'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {timeAgo(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
