'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

interface PlanData {
  plan: string;
  limits: {
    maxVaults: number;
    maxSecretsPerVault: number;
    maxMembersPerVault: number;
    auditRetentionDays: number;
    maxServiceTokens: number;
  };
  usage: {
    vaults: number;
    serviceTokens: number;
  };
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
  } | null;
}

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
};

const PLAN_PRICES: Record<string, string> = {
  free: '$0/mo',
  pro: '$12/user/mo',
  team: '$28/user/mo',
  enterprise: 'Custom',
};

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max === -1;
  const percent = unlimited ? 0 : Math.min((used / max) * 100, 100);
  const isNearLimit = !unlimited && percent >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used} / {unlimited ? '∞' : max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isNearLimit ? 'bg-warning' : 'bg-primary'
          }`}
          style={{ width: unlimited ? '0%' : `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast('Subscription activated! Welcome to your new plan.', 'success');
    } else if (searchParams.get('canceled') === 'true') {
      toast('Checkout canceled.', 'error');
    }
  }, [searchParams]);

  useEffect(() => {
    loadPlan();
  }, []);

  async function loadPlan() {
    try {
      const planData = await api.getPlan();
      setData(planData);
    } catch (err: any) {
      toast(err.message || 'Failed to load billing data', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(plan: string) {
    setUpgrading(true);
    try {
      const { url } = await api.createCheckout(plan);
      window.location.href = url;
    } catch (err: any) {
      toast(err.message || 'Failed to start checkout', 'error');
      setUpgrading(false);
    }
  }

  async function handleManage() {
    try {
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch (err: any) {
      toast(err.message || 'Failed to open billing portal', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const isPaid = data.plan !== 'free';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your plan and usage
        </p>
      </div>

      {/* Current Plan */}
      <div className="border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{PLAN_NAMES[data.plan]} Plan</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                data.subscription?.status === 'active'
                  ? 'bg-success/20 text-success'
                  : data.subscription?.status === 'past_due'
                  ? 'bg-warning/20 text-warning'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {data.subscription?.status === 'active' ? 'Active' :
                 data.subscription?.status === 'past_due' ? 'Past Due' : 'Active'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {PLAN_PRICES[data.plan]}
            </p>
            {data.subscription?.current_period_end && (
              <p className="text-xs text-muted-foreground mt-1">
                {data.subscription.cancel_at_period_end
                  ? `Cancels on ${new Date(data.subscription.current_period_end).toLocaleDateString()}`
                  : `Renews on ${new Date(data.subscription.current_period_end).toLocaleDateString()}`
                }
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {isPaid && data.subscription?.stripe_customer_id && (
              <Button variant="ghost" onClick={handleManage}>
                Manage Billing
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="border border-border rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold">Usage</h2>
        <UsageBar label="Vaults" used={data.usage.vaults} max={data.limits.maxVaults} />
        <UsageBar label="Service Tokens" used={data.usage.serviceTokens} max={data.limits.maxServiceTokens} />
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Secrets per vault</span>
          <span className="text-muted-foreground">
            {data.limits.maxSecretsPerVault === -1 ? 'Unlimited' : `Max ${data.limits.maxSecretsPerVault}`}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Members per vault</span>
          <span className="text-muted-foreground">
            {data.limits.maxMembersPerVault === -1 ? 'Unlimited' : `Max ${data.limits.maxMembersPerVault}`}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Audit log retention</span>
          <span className="text-muted-foreground">
            {data.limits.auditRetentionDays === -1 ? 'Unlimited' : `${data.limits.auditRetentionDays} days`}
          </span>
        </div>
      </div>

      {/* Upgrade Options */}
      {data.plan === 'free' && (
        <div className="border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Upgrade your plan</h2>
          <p className="text-sm text-muted-foreground">
            Unlock unlimited vaults, secrets, and members. Get advanced features like secret rotation and webhooks.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-primary rounded-xl p-5 space-y-3">
              <h3 className="font-semibold">Pro</h3>
              <p className="text-2xl font-bold">$12<span className="text-sm font-normal text-muted-foreground">/user/mo</span></p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Unlimited everything</li>
                <li>90-day audit log</li>
                <li>Secret rotation + Webhooks</li>
              </ul>
              <Button onClick={() => handleUpgrade('pro')} disabled={upgrading} className="w-full">
                {upgrading ? 'Redirecting...' : 'Upgrade to Pro'}
              </Button>
            </div>
            <div className="border border-border rounded-xl p-5 space-y-3">
              <h3 className="font-semibold">Team</h3>
              <p className="text-2xl font-bold">$28<span className="text-sm font-normal text-muted-foreground">/user/mo</span></p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Everything in Pro</li>
                <li>SSO + Secret scanning</li>
                <li>99.9% SLA</li>
              </ul>
              <Button variant="ghost" onClick={() => handleUpgrade('team')} disabled={upgrading} className="w-full">
                {upgrading ? 'Redirecting...' : 'Upgrade to Team'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {data.plan === 'pro' && (
        <div className="border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Need more?</h2>
          <p className="text-sm text-muted-foreground">
            Upgrade to Team for SSO, secret scanning, IP allowlisting, and 99.9% SLA.
          </p>
          <Button variant="ghost" onClick={() => handleUpgrade('team')} disabled={upgrading}>
            {upgrading ? 'Redirecting...' : 'Upgrade to Team — $28/user/mo'}
          </Button>
        </div>
      )}
    </div>
  );
}
