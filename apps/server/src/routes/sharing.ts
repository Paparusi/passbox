import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { checkMemberLimit } from '../lib/plans.js';

type SharingEnv = {
  Variables: {
    userId: string;
  };
};

const sharing = new Hono<SharingEnv>();

// ─── List Vault Members ────────────────────────────
sharing.get('/:vaultId/members', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const supabase = getSupabaseAdmin();

  // Check access
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership) throw Errors.notFound('Vault');

  const { data: members } = await supabase
    .from('vault_members')
    .select('id, user_id, role, created_at')
    .eq('vault_id', vaultId);

  // Get user emails
  const userIds = (members || []).map(m => m.user_id);
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const userMap = new Map(users.map(u => [u.id, u.email]));

  const result = (members || []).map(m => ({
    ...m,
    email: userMap.get(m.user_id) || 'unknown',
  }));

  return c.json({ success: true, data: result });
});

// ─── Add Vault Member ──────────────────────────────
const addMemberSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['admin', 'member', 'viewer']),
  encryptedVaultKey: z.string().max(10_000),
});

sharing.post('/:vaultId/members', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const body = await c.req.json();
  const data = addMemberSchema.parse(body);
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

  // Find target user by email
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const targetUser = users.find(u => u.email === data.email);

  if (!targetUser) {
    throw Errors.badRequest('Could not add member. Ensure the email is registered.');
  }

  // Check plan limits
  await checkMemberLimit(vaultId, userId);

  // Add member
  const { error } = await supabase.from('vault_members').insert({
    vault_id: vaultId,
    user_id: targetUser.id,
    encrypted_vault_key: data.encryptedVaultKey,
    role: data.role,
    granted_by: userId,
  });

  if (error) {
    if (error.code === '23505') {
      throw Errors.conflict('User is already a member of this vault');
    }
    throw Errors.internal(error.message);
  }

  return c.json({ success: true }, 201);
});

// ─── Update Member Role ────────────────────────────
const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});

sharing.put('/:vaultId/members/:memberId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const memberId = c.req.param('memberId');
  const body = await c.req.json();
  const data = updateRoleSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Check owner/admin
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw Errors.forbidden();
  }

  await supabase
    .from('vault_members')
    .update({ role: data.role })
    .eq('vault_id', vaultId)
    .eq('user_id', memberId);

  return c.json({ success: true });
});

// ─── Remove Member ─────────────────────────────────
sharing.delete('/:vaultId/members/:memberId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const memberId = c.req.param('memberId');
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

  // Cannot remove owner
  const { data: target } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', memberId)
    .single();

  if (target?.role === 'owner') {
    throw Errors.badRequest('Cannot remove the vault owner');
  }

  await supabase
    .from('vault_members')
    .delete()
    .eq('vault_id', vaultId)
    .eq('user_id', memberId);

  return c.json({ success: true });
});

// ─── Get User Public Key ───────────────────────────
sharing.get('/user-key/:email', async (c) => {
  const userId = c.get('userId');
  const email = c.req.param('email');
  const supabase = getSupabaseAdmin();

  const { data: { users } } = await supabase.auth.admin.listUsers();
  const targetUser = users.find(u => u.email === email);

  if (!targetUser) {
    throw Errors.badRequest('User not found or has no encryption keys');
  }

  const { data: keys } = await supabase
    .from('user_keys')
    .select('public_key')
    .eq('user_id', targetUser.id)
    .single();

  if (!keys) {
    throw Errors.badRequest('User not found or has no encryption keys');
  }

  return c.json({ success: true, data: { publicKey: keys.public_key } });
});

export { sharing };
