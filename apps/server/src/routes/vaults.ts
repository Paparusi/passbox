import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { checkVaultLimit } from '../lib/plans.js';

type VaultEnv = {
  Variables: {
    userId: string;
  };
};

const vaults = new Hono<VaultEnv>();

// ─── Create Vault ──────────────────────────────────
const createVaultSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  encryptedKey: z.string().max(10_000),
  encryptedVaultKey: z.string().max(10_000),
  orgId: z.string().uuid().optional(),
});

vaults.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const data = createVaultSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Check plan limits
  await checkVaultLimit(userId);

  // Get org if not provided
  let orgId = data.orgId;
  if (!orgId) {
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .single();
    orgId = membership?.org_id;
  }

  // Create vault
  const { data: vault, error } = await supabase
    .from('vaults')
    .insert({
      org_id: orgId,
      name: data.name,
      description: data.description || null,
      encrypted_key: data.encryptedKey,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    throw Errors.internal(error.message);
  }

  // Add creator as owner member
  await supabase.from('vault_members').insert({
    vault_id: vault.id,
    user_id: userId,
    encrypted_vault_key: data.encryptedVaultKey,
    role: 'owner',
    granted_by: userId,
  });

  return c.json({ success: true, data: vault }, 201);
});

// ─── List Vaults ───────────────────────────────────
vaults.get('/', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin();

  // Get vault IDs user is member of
  const { data: memberships } = await supabase
    .from('vault_members')
    .select('vault_id, role, encrypted_vault_key')
    .eq('user_id', userId);

  if (!memberships || memberships.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const vaultIds = memberships.map((m) => m.vault_id);
  const { data: vaultList } = await supabase
    .from('vaults')
    .select('*')
    .in('id', vaultIds)
    .order('created_at', { ascending: false });

  // Merge role and encrypted vault key into vault data
  const result = (vaultList || []).map((v) => {
    const membership = memberships.find((m) => m.vault_id === v.id);
    return {
      ...v,
      role: membership?.role,
      encryptedVaultKey: membership?.encrypted_vault_key,
    };
  });

  return c.json({ success: true, data: result });
});

// ─── Get Vault ─────────────────────────────────────
vaults.get('/:id', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('id');
  const supabase = getSupabaseAdmin();

  // Check membership
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role, encrypted_vault_key')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    throw Errors.notFound('Vault');
  }

  const { data: vault } = await supabase
    .from('vaults')
    .select('*')
    .eq('id', vaultId)
    .single();

  if (!vault) {
    throw Errors.notFound('Vault');
  }

  return c.json({
    success: true,
    data: {
      ...vault,
      role: membership.role,
      encryptedVaultKey: membership.encrypted_vault_key,
    },
  });
});

// ─── Update Vault ──────────────────────────────────
const updateVaultSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
});

vaults.put('/:id', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('id');
  const body = await c.req.json();
  const data = updateVaultSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Check admin+ role
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw Errors.forbidden();
  }

  const { data: vault, error } = await supabase
    .from('vaults')
    .update(data)
    .eq('id', vaultId)
    .select()
    .single();

  if (error) {
    throw Errors.internal(error.message);
  }

  return c.json({ success: true, data: vault });
});

// ─── Delete Vault ──────────────────────────────────
vaults.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('id');
  const supabase = getSupabaseAdmin();

  // Check owner role
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership || membership.role !== 'owner') {
    throw Errors.forbidden();
  }

  await supabase.from('vaults').delete().eq('id', vaultId);

  return c.json({ success: true });
});

export { vaults };
