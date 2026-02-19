import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { fireWebhookEvent } from '../lib/webhook-sender.js';

type WebhookEnv = {
  Variables: {
    userId: string;
    emailVerified: boolean;
  };
};

const webhooks = new Hono<WebhookEnv>();

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

const VALID_EVENTS = ['secret.created', 'secret.updated', 'secret.deleted', 'secret.rotated'];

// ─── List Webhooks ────────────────────────────────
webhooks.get('/:vaultId/webhooks', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const supabase = getSupabaseAdmin();

  // Any vault member can view webhooks
  const { data: membership } = await supabase
    .from('vault_members')
    .select('role')
    .eq('vault_id', vaultId)
    .eq('user_id', userId)
    .single();

  if (!membership) throw Errors.notFound('Vault');

  const { data } = await supabase
    .from('webhooks')
    .select('*')
    .eq('vault_id', vaultId)
    .order('created_at');

  return c.json({ success: true, data: data || [] });
});

// ─── Create Webhook ───────────────────────────────
// SSRF protection: only allow HTTPS URLs pointing to public hosts
function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    // Block private/internal IPs and localhost
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
    if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (host === 'metadata.google.internal' || host === '169.254.169.254') return false;
    return true;
  } catch {
    return false;
  }
}

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(2000).refine(validateWebhookUrl, 'Webhook URL must be HTTPS and point to a public host'),
  events: z.array(z.enum(['secret.created', 'secret.updated', 'secret.deleted', 'secret.rotated'])).min(1),
});

webhooks.post('/:vaultId/webhooks', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const body = await c.req.json();
  const data = createWebhookSchema.parse(body);
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);

  // Generate signing secret
  const signingSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .insert({
      vault_id: vaultId,
      name: data.name,
      url: data.url,
      events: data.events,
      signing_secret: signingSecret,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw Errors.conflict(`Webhook "${data.name}" already exists in this vault`);
    }
    throw Errors.internal(error.message);
  }

  return c.json({ success: true, data: webhook }, 201);
});

// ─── Update Webhook ───────────────────────────────
const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().max(2000).refine(u => validateWebhookUrl(u), 'Webhook URL must be HTTPS and point to a public host').optional(),
  events: z.array(z.enum(['secret.created', 'secret.updated', 'secret.deleted', 'secret.rotated'])).min(1).optional(),
  active: z.boolean().optional(),
});

webhooks.put('/:vaultId/webhooks/:id', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const webhookId = c.req.param('id');
  const body = await c.req.json();
  const data = updateWebhookSchema.parse(body);
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .update(data)
    .eq('id', webhookId)
    .eq('vault_id', vaultId)
    .select()
    .single();

  if (error) throw Errors.internal(error.message);
  if (!webhook) throw Errors.notFound('Webhook');

  return c.json({ success: true, data: webhook });
});

// ─── Delete Webhook ───────────────────────────────
webhooks.delete('/:vaultId/webhooks/:id', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const webhookId = c.req.param('id');
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);

  await supabase.from('webhooks').delete().eq('id', webhookId).eq('vault_id', vaultId);

  return c.json({ success: true });
});

// ─── Test Webhook ─────────────────────────────────
webhooks.post('/:vaultId/webhooks/:id/test', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const webhookId = c.req.param('id');
  const supabase = getSupabaseAdmin();

  await checkVaultAdmin(supabase, vaultId, userId);

  const { data: webhook } = await supabase
    .from('webhooks')
    .select('*')
    .eq('id', webhookId)
    .eq('vault_id', vaultId)
    .single();

  if (!webhook) throw Errors.notFound('Webhook');

  // Send test event
  await fireWebhookEvent(vaultId, 'secret.updated', { secretName: '__test__', test: true });

  return c.json({ success: true, data: { message: 'Test event sent' } });
});

export { webhooks };
