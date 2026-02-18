import { getSupabaseAdmin } from './supabase.js';
import { AppError } from './errors.js';

export interface PlanLimits {
  maxVaults: number;
  maxSecretsPerVault: number;
  maxMembersPerVault: number;
  auditRetentionDays: number;
  maxServiceTokens: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxVaults: 3,
    maxSecretsPerVault: 50,
    maxMembersPerVault: 2,
    auditRetentionDays: 7,
    maxServiceTokens: 1,
  },
  pro: {
    maxVaults: -1, // unlimited
    maxSecretsPerVault: -1,
    maxMembersPerVault: -1,
    auditRetentionDays: 90,
    maxServiceTokens: 50,
  },
  team: {
    maxVaults: -1,
    maxSecretsPerVault: -1,
    maxMembersPerVault: -1,
    auditRetentionDays: 365,
    maxServiceTokens: -1,
  },
  enterprise: {
    maxVaults: -1,
    maxSecretsPerVault: -1,
    maxMembersPerVault: -1,
    auditRetentionDays: -1, // unlimited
    maxServiceTokens: -1,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function getUserPlan(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single();

  if (!data || data.status !== 'active') return 'free';
  return data.plan;
}

export async function getUserUsage(userId: string) {
  const supabase = getSupabaseAdmin();

  // Count vaults owned
  const { count: vaultCount } = await supabase
    .from('vault_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'owner');

  // Count service tokens
  const { count: tokenCount } = await supabase
    .from('service_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return {
    vaults: vaultCount || 0,
    serviceTokens: tokenCount || 0,
  };
}

export async function checkVaultLimit(userId: string): Promise<void> {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);
  if (limits.maxVaults === -1) return;

  const usage = await getUserUsage(userId);
  if (usage.vaults >= limits.maxVaults) {
    throw new AppError(
      403,
      'PLAN_LIMIT',
      `Free plan allows ${limits.maxVaults} vaults. Upgrade to Pro for unlimited.`,
    );
  }
}

export async function checkSecretLimit(vaultId: string, userId: string): Promise<void> {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);
  if (limits.maxSecretsPerVault === -1) return;

  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('secrets')
    .select('*', { count: 'exact', head: true })
    .eq('vault_id', vaultId);

  if ((count || 0) >= limits.maxSecretsPerVault) {
    throw new AppError(
      403,
      'PLAN_LIMIT',
      `Free plan allows ${limits.maxSecretsPerVault} secrets per vault. Upgrade to Pro for unlimited.`,
    );
  }
}

export async function checkMemberLimit(vaultId: string, userId: string): Promise<void> {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);
  if (limits.maxMembersPerVault === -1) return;

  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('vault_members')
    .select('*', { count: 'exact', head: true })
    .eq('vault_id', vaultId);

  if ((count || 0) >= limits.maxMembersPerVault) {
    throw new AppError(
      403,
      'PLAN_LIMIT',
      `Free plan allows ${limits.maxMembersPerVault} members per vault. Upgrade to Pro for unlimited.`,
    );
  }
}
