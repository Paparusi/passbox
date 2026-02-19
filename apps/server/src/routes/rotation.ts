import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { fireWebhookEvent } from '../lib/webhook-sender.js';

type RotationEnv = {
  Variables: {
    userId: string;
    emailVerified: boolean;
  };
};

const rotation = new Hono<RotationEnv>();

// Helper: check vault admin access
async function checkVaultAdmin(supabase: any, vaultId: string, userId: string) {
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw Errors.forbidden();
  }
}

// Helper: get secret by name in vault
async function getSecret(supabase: any, vaultId: string, name: string) {
  const { data: secret } = await supabase
    .from('secrets')
    .select('id, name, vault_id')
    .eq('vault_id', vaultId)
    .eq('name', name)
    .single();

  if (!secret) throw Errors.notFound(`Secret "${name}"`);
  return secret;
}

// ─── Get Rotation Config ──────────────────────────
rotation.get('/:vaultId/secrets/:name/rotation', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const supabase = getSupabaseAdmin();

  // Check membership
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();
  if (!membership) throw Errors.notFound('Vault');

  const secret = await getSecret(supabase, vaultId, name);

  const { data: config } = await supabase
    .from('rotation_configs')
    .select('*')
    .eq('secret_id', secret.id)
    .single();

  return c.json({ success: true, data: config || null });
});

// ─── Set/Update Rotation Config ───────────────────
const upsertRotationSchema = z.object({
  intervalHours: z.number().min(1).max(8760), // 1 hour to 1 year
  webhookId: z.string().uuid().optional().nullable(),
  enabled: z.boolean().optional(),
});

rotation.put('/:vaultId/secrets/:name/rotation', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const body = await c.req.json();
  const data = upsertRotationSchema.parse(body);
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);
  const secret = await getSecret(supabase, vaultId, name);

  const now = new Date();
  const nextRotation = new Date(now.getTime() + data.intervalHours * 60 * 60 * 1000);

  // Upsert rotation config
  const { data: existing } = await supabase
    .from('rotation_configs')
    .select('id')
    .eq('secret_id', secret.id)
    .single();

  let config;
  if (existing) {
    const { data: updated } = await supabase
      .from('rotation_configs')
      .update({
        interval_hours: data.intervalHours,
        webhook_id: data.webhookId ?? null,
        enabled: data.enabled ?? true,
        next_rotation_at: nextRotation.toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();
    config = updated;
  } else {
    const { data: created } = await supabase
      .from('rotation_configs')
      .insert({
        secret_id: secret.id,
        interval_hours: data.intervalHours,
        webhook_id: data.webhookId ?? null,
        enabled: data.enabled ?? true,
        next_rotation_at: nextRotation.toISOString(),
      })
      .select()
      .single();
    config = created;
  }

  return c.json({ success: true, data: config });
});

// ─── Remove Rotation Config ──────────────────────
rotation.delete('/:vaultId/secrets/:name/rotation', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);
  const secret = await getSecret(supabase, vaultId, name);

  await supabase.from('rotation_configs').delete().eq('secret_id', secret.id);

  return c.json({ success: true });
});

// ─── Manual Rotate (trigger webhook) ──────────────
rotation.post('/:vaultId/secrets/:name/rotate', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const name = c.req.param('name');
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);
  const secret = await getSecret(supabase, vaultId, name);

  // Update rotation tracking
  const now = new Date();
  const { data: config } = await supabase
    .from('rotation_configs')
    .select('*')
    .eq('secret_id', secret.id)
    .single();

  if (config) {
    const nextRotation = new Date(now.getTime() + config.interval_hours * 60 * 60 * 1000);
    await supabase
      .from('rotation_configs')
      .update({
        last_rotated_at: now.toISOString(),
        next_rotation_at: nextRotation.toISOString(),
      })
      .eq('id', config.id);
  }

  // Fire webhook event
  await fireWebhookEvent(vaultId, 'secret.rotated', { secretName: name });

  return c.json({ success: true, data: { rotatedAt: now.toISOString() } });
});

export { rotation };
