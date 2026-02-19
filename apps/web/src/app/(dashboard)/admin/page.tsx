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
  subscriptions: Record<string, number>;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border rounded-xl p-5 space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        await api.adminCheck();
        const data = await api.adminGetStats();
        setStats(data);
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Total Vaults" value={stats.totalVaults} />
        <StatCard label="Total Secrets" value={stats.totalSecrets} />
        <StatCard label="Organizations" value={stats.totalOrgs} />
        <StatCard label="Waitlist" value={stats.waitlistCount} />
        <StatCard label="Active Subscriptions" value={totalActiveSubs} />
      </div>

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
    </div>
  );
}
