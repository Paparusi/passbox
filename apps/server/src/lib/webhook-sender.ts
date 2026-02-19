import { getSupabaseAdmin } from './supabase.js';

export type WebhookEvent = 'secret.created' | 'secret.updated' | 'secret.deleted' | 'secret.rotated';

interface WebhookPayload {
  event: WebhookEvent;
  vaultId: string;
  secretName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Fire webhook events for a vault. Sends to all active webhooks that subscribe to the event.
 * Non-blocking — errors are logged but don't throw.
 */
export async function fireWebhookEvent(vaultId: string, event: WebhookEvent, metadata?: { secretName?: string; [key: string]: any }) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: webhooks } = await supabase
      .from('webhooks')
      .select('*')
      .eq('vault_id', vaultId)
      .eq('active', true)
      .contains('events', [event]);

    if (!webhooks || webhooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      vaultId,
      secretName: metadata?.secretName,
      timestamp: new Date().toISOString(),
      metadata,
    };

    const body = JSON.stringify(payload);

    for (const webhook of webhooks) {
      // Fire and forget with retry
      sendWithRetry(webhook, body, supabase).catch(() => {});
    }
  } catch {
    // Silent fail — webhook delivery should never break the main flow
  }
}

async function sendWithRetry(webhook: any, body: string, supabase: any, attempt = 1): Promise<void> {
  const maxAttempts = 3;

  try {
    // HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhook.signing_secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PassBox-Signature': `sha256=${signature}`,
        'X-PassBox-Event': JSON.parse(body).event,
        'User-Agent': 'PassBox-Webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    // Update last_triggered_at
    await supabase
      .from('webhooks')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', webhook.id);

    if (!response.ok && attempt < maxAttempts) {
      // Exponential backoff: 1s, 4s
      await new Promise(r => setTimeout(r, attempt * attempt * 1000));
      return sendWithRetry(webhook, body, supabase, attempt + 1);
    }
  } catch {
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, attempt * attempt * 1000));
      return sendWithRetry(webhook, body, supabase, attempt + 1);
    }
  }
}
