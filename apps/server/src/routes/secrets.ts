import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { checkSecretLimit } from '../lib/plans.js';
import { fireWebhookEvent } from '../lib/webhook-sender.js';

type SecretEnv = {
  Variables: {
    userId: string;
    emailVerified: boolean;
  };
};

const secrets = new Hono<SecretEnv>();

const MAX_BLOB_FIELD = 1_000_000; // 1MB max per field

const encryptedBlobSchema = z.object({
  iv: z.string().max(100),
  ciphertext: z.string().max(MAX_BLOB_FIELD),
  tag: z.string().max(100),
  algorithm: z.literal('aes-256-gcm'),
});

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

// Helper: resolve environmentId — use provided ID or fall back to vault's default
async function resolveEnvironmentId(supabase: any, vaultId: string, environmentId?: string): Promise<string> {
  if (environmentId) {
    // Verify it belongs to this vault
    const { data: env } = await supabase
      .from('environments')
      .select('id')
      .eq('id', environmentId)
      .eq('vault_id', vaultId)
      .single();
    if (!env) throw Errors.notFound('Environment');
    return environmentId;
  }

  // Fall back to default environment
  const { data: defaultEnv } = await supabase
    .from('environments')
    .select('id')
    .eq('vault_id', vaultId)
    .eq('is_default', true)
    .single();

  if (!defaultEnv) throw Errors.internal('Vault has no default environment');
  return defaultEnv.id;
}

// ─── Create Secret ─────────────────────────────────
const createSecretSchema = z.object({
  name: z.string().min(1).max(256),
  encryptedValue: encryptedBlobSchema,
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  environmentId: z.string().uuid().optional(),
});

secrets.post('/:vaultId/secrets', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const body = await c.req.json();
  const data = createSecretSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (role === 'viewer') throw Errors.forbidden();

  // Check plan limits
  await checkSecretLimit(vaultId, userId);

  const environmentId = await resolveEnvironmentId(supabase, vaultId, data.environmentId);

  const { data: secret, error } = await supabase
    .from('secrets')
    .insert({
      vault_id: vaultId,
      environment_id: environmentId,
      name: data.name,
      encrypted_value: JSON.stringify(data.encryptedValue),
      description: data.description || null,
      tags: data.tags || [],
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw Errors.conflict(`Secret "${data.name}" already exists in this environment`);
    }
    throw Errors.internal(error.message);
  }

  // Create first version
  await supabase.from('secret_versions').insert({
    secret_id: secret.id,
    version: 1,
    encrypted_value: JSON.stringify(data.encryptedValue),
    created_by: userId,
  });

  fireWebhookEvent(vaultId, 'secret.created', { secretName: data.name });

  return c.json({ success: true, data: secret }, 201);
});

// ─── List Secrets ──────────────────────────────────
secrets.get('/:vaultId/secrets', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const environmentId = c.req.query('environmentId');
  const supabase = getSupabaseAdmin();

  await checkVaultAccess(supabase, vaultId, userId);

  let query = supabase
    .from('secrets')
    .select('id, name, tags, version, created_at, updated_at, encrypted_value, environment_id')
    .eq('vault_id', vaultId);

  if (environmentId) {
    query = query.eq('environment_id', environmentId);
  }

  const { data: secretList } = await query.order('name');

  return c.json({ success: true, data: secretList || [] });
});

// ─── Get Secret by Name ────────────────────────────
secrets.get('/:vaultId/secrets/:name', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const environmentId = c.req.query('environmentId');
  const supabase = getSupabaseAdmin();

  await checkVaultAccess(supabase, vaultId, userId);

  let query = supabase
    .from('secrets')
    .select('*')
    .eq('vault_id', vaultId)
    .eq('name', name);

  if (environmentId) {
    query = query.eq('environment_id', environmentId);
  }

  const { data: secret } = await query.single();

  if (!secret) {
    throw Errors.notFound(`Secret "${name}"`);
  }

  return c.json({ success: true, data: secret });
});

// ─── Update Secret ─────────────────────────────────
const updateSecretSchema = z.object({
  encryptedValue: encryptedBlobSchema,
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  environmentId: z.string().uuid().optional(),
});

secrets.put('/:vaultId/secrets/:name', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const body = await c.req.json();
  const data = updateSecretSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (role === 'viewer') throw Errors.forbidden();

  // Get current secret (optionally filtered by environment)
  let query = supabase
    .from('secrets')
    .select('id, version')
    .eq('vault_id', vaultId)
    .eq('name', name);

  if (data.environmentId) {
    query = query.eq('environment_id', data.environmentId);
  }

  const { data: current } = await query.single();

  if (!current) {
    throw Errors.notFound(`Secret "${name}"`);
  }

  const newVersion = current.version + 1;

  // Update secret
  const { data: secret, error } = await supabase
    .from('secrets')
    .update({
      encrypted_value: JSON.stringify(data.encryptedValue),
      description: data.description,
      tags: data.tags,
      version: newVersion,
    })
    .eq('id', current.id)
    .select()
    .single();

  if (error) {
    throw Errors.internal(error.message);
  }

  // Save version history
  await supabase.from('secret_versions').insert({
    secret_id: current.id,
    version: newVersion,
    encrypted_value: JSON.stringify(data.encryptedValue),
    created_by: userId,
  });

  fireWebhookEvent(vaultId, 'secret.updated', { secretName: name });

  return c.json({ success: true, data: secret });
});

// ─── Delete Secret ─────────────────────────────────
secrets.delete('/:vaultId/secrets/:name', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const environmentId = c.req.query('environmentId');
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (!['owner', 'admin'].includes(role)) throw Errors.forbidden();

  let query = supabase
    .from('secrets')
    .delete()
    .eq('vault_id', vaultId)
    .eq('name', name);

  if (environmentId) {
    query = query.eq('environment_id', environmentId);
  }

  const { error } = await query;

  if (error) {
    throw Errors.internal(error.message);
  }

  fireWebhookEvent(vaultId, 'secret.deleted', { secretName: name });

  return c.json({ success: true });
});

// ─── Get Secret Versions ───────────────────────────
secrets.get('/:vaultId/secrets/:name/versions', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const environmentId = c.req.query('environmentId');
  const supabase = getSupabaseAdmin();

  await checkVaultAccess(supabase, vaultId, userId);

  let query = supabase
    .from('secrets')
    .select('id')
    .eq('vault_id', vaultId)
    .eq('name', name);

  if (environmentId) {
    query = query.eq('environment_id', environmentId);
  }

  const { data: secret } = await query.single();

  if (!secret) {
    throw Errors.notFound(`Secret "${name}"`);
  }

  const { data: versions } = await supabase
    .from('secret_versions')
    .select('*')
    .eq('secret_id', secret.id)
    .order('version', { ascending: false });

  return c.json({ success: true, data: versions || [] });
});

// ─── Bulk Create/Update ────────────────────────────
const bulkSecretSchema = z.object({
  name: z.string().min(1).max(256),
  encryptedValue: encryptedBlobSchema,
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const bulkSchema = z.object({
  secrets: z.array(bulkSecretSchema).max(100),
  environmentId: z.string().uuid().optional(),
});

secrets.post('/:vaultId/secrets/bulk', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const body = await c.req.json();
  const data = bulkSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const role = await checkVaultAccess(supabase, vaultId, userId);
  if (role === 'viewer') throw Errors.forbidden();

  // Check plan limits for new secrets
  await checkSecretLimit(vaultId, userId);

  const environmentId = await resolveEnvironmentId(supabase, vaultId, data.environmentId);

  const results = { created: 0, updated: 0, errors: [] as string[] };

  for (const secret of data.secrets) {
    // Check if exists in this environment
    const { data: existing } = await supabase
      .from('secrets')
      .select('id, version')
      .eq('vault_id', vaultId)
      .eq('environment_id', environmentId)
      .eq('name', secret.name)
      .single();

    if (existing) {
      // Update
      const newVersion = existing.version + 1;
      await supabase
        .from('secrets')
        .update({
          encrypted_value: JSON.stringify(secret.encryptedValue),
          version: newVersion,
        })
        .eq('id', existing.id);

      await supabase.from('secret_versions').insert({
        secret_id: existing.id,
        version: newVersion,
        encrypted_value: JSON.stringify(secret.encryptedValue),
        created_by: userId,
      });

      results.updated++;
    } else {
      // Create
      const { data: newSecret, error } = await supabase
        .from('secrets')
        .insert({
          vault_id: vaultId,
          environment_id: environmentId,
          name: secret.name,
          encrypted_value: JSON.stringify(secret.encryptedValue),
          description: secret.description || null,
          tags: secret.tags || [],
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        results.errors.push(`${secret.name}: ${error.message}`);
      } else {
        await supabase.from('secret_versions').insert({
          secret_id: newSecret.id,
          version: 1,
          encrypted_value: JSON.stringify(secret.encryptedValue),
          created_by: userId,
        });
        results.created++;
      }
    }
  }

  return c.json({ success: true, data: results });
});

export { secrets };
