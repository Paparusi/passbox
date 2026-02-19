import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { checkEnvironmentLimit } from '../lib/plans.js';

type EnvEnv = {
  Variables: {
    userId: string;
    emailVerified: boolean;
  };
};

const environments = new Hono<EnvEnv>();

// Helper: check vault membership and return role
async function checkVaultAccess(supabase: any, vaultId: string, userId: string) {
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    throw Errors.notFound('Vault');
  }
  return membership.role as string;
}

// ─── List Environments ────────────────────────────
environments.get('/:vaultId/environments', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const supabase = getSupabaseAdmin();

  await checkVaultAccess(supabase, vaultId, userId);

  const { data: envs } = await supabase
    .from('environments')
    .select('*')
    .eq('vault_id', vaultId)
    .order('is_default', { ascending: false })
    .order('name');

  return c.json({ success: true, data: envs || [] });
});

// ─── Create Environment ───────────────────────────
const createEnvSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric with dashes/underscores'),
  description: z.string().max(500).optional(),
});

environments.post('/:vaultId/environments', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const body = await c.req.json();
  const data = createEnvSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (role === 'viewer') throw Errors.forbidden();

  // Check plan limits
  await checkEnvironmentLimit(vaultId, userId);

  const { data: env, error } = await supabase
    .from('environments')
    .insert({
      vault_id: vaultId,
      name: data.name.toLowerCase(),
      description: data.description || null,
      is_default: false,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw Errors.conflict(`Environment "${data.name}" already exists in this vault`);
    }
    throw Errors.internal(error.message);
  }

  return c.json({ success: true, data: env }, 201);
});

// ─── Update Environment ───────────────────────────
const updateEnvSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  description: z.string().max(500).optional(),
});

environments.put('/:vaultId/environments/:envId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const envId = c.req.param('envId');
  const body = await c.req.json();
  const data = updateEnvSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (!['owner', 'admin'].includes(role)) throw Errors.forbidden();

  const updates: Record<string, any> = {};
  if (data.name) updates.name = data.name.toLowerCase();
  if (data.description !== undefined) updates.description = data.description || null;

  const { data: env, error } = await supabase
    .from('environments')
    .update(updates)
    .eq('id', envId)
    .eq('vault_id', vaultId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw Errors.conflict(`Environment "${data.name}" already exists`);
    }
    throw Errors.internal(error.message);
  }

  if (!env) throw Errors.notFound('Environment');

  return c.json({ success: true, data: env });
});

// ─── Delete Environment ───────────────────────────
environments.delete('/:vaultId/environments/:envId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const envId = c.req.param('envId');
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (!['owner', 'admin'].includes(role)) throw Errors.forbidden();

  // Cannot delete default environment
  const { data: env } = await supabase
    .from('environments')
    .select('is_default')
    .eq('id', envId)
    .eq('vault_id', vaultId)
    .single();

  if (!env) throw Errors.notFound('Environment');
  if (env.is_default) throw Errors.badRequest('Cannot delete the default environment');

  await supabase.from('environments').delete().eq('id', envId).eq('vault_id', vaultId);

  return c.json({ success: true });
});

// ─── Clone Environment ────────────────────────────
const cloneEnvSchema = z.object({
  fromEnvironmentId: z.string().uuid(),
});

environments.post('/:vaultId/environments/:envId/clone', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const targetEnvId = c.req.param('envId');
  const body = await c.req.json();
  const data = cloneEnvSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (role === 'viewer') throw Errors.forbidden();

  // Verify both environments belong to this vault
  const { data: envs } = await supabase
    .from('environments')
    .select('id')
    .eq('vault_id', vaultId)
    .in('id', [targetEnvId, data.fromEnvironmentId]);

  if (!envs || envs.length !== 2) {
    throw Errors.badRequest('Both environments must belong to this vault');
  }

  // Get secrets from source environment
  const { data: sourceSecrets } = await supabase
    .from('secrets')
    .select('name, encrypted_value, description, tags')
    .eq('vault_id', vaultId)
    .eq('environment_id', data.fromEnvironmentId);

  let created = 0;
  for (const secret of (sourceSecrets || [])) {
    // Check if already exists in target
    const { data: existing } = await supabase
      .from('secrets')
      .select('id')
      .eq('vault_id', vaultId)
      .eq('environment_id', targetEnvId)
      .eq('name', secret.name)
      .single();

    if (!existing) {
      const { data: newSecret } = await supabase
        .from('secrets')
        .insert({
          vault_id: vaultId,
          environment_id: targetEnvId,
          name: secret.name,
          encrypted_value: secret.encrypted_value,
          description: secret.description,
          tags: secret.tags,
          created_by: userId,
        })
        .select()
        .single();

      if (newSecret) {
        await supabase.from('secret_versions').insert({
          secret_id: newSecret.id,
          version: 1,
          encrypted_value: secret.encrypted_value,
          created_by: userId,
        });
        created++;
      }
    }
  }

  return c.json({ success: true, data: { created } });
});

export { environments };
