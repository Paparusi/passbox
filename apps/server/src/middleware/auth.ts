import { createMiddleware } from 'hono/factory';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

type AuthEnv = {
  Variables: {
    userId: string;
    userEmail: string;
    emailVerified: boolean;
    tokenId?: string;
  };
};

/**
 * Auth middleware: validates JWT or service token.
 * Sets userId and userEmail in context.
 */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    throw Errors.unauthorized();
  }

  const token = authHeader.replace('Bearer ', '');

  // Check if it's a service token (starts with pb_)
  if (token.startsWith('pb_')) {
    const supabase = getSupabaseAdmin();
    const tokenHash = await hashToken(token);

    const { data: serviceToken, error } = await supabase
      .from('service_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (error || !serviceToken) {
      throw Errors.unauthorized();
    }

    // Check expiration
    if (serviceToken.expires_at && new Date(serviceToken.expires_at) < new Date()) {
      throw Errors.unauthorized();
    }

    // Update last_used_at
    await supabase
      .from('service_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', serviceToken.id);

    c.set('userId', serviceToken.user_id);
    c.set('userEmail', '');
    c.set('emailVerified', true);
    c.set('tokenId', serviceToken.id);

    // Validate vault scope: if token is scoped to specific vaults,
    // check that the requested vault is allowed
    if (serviceToken.vault_ids && serviceToken.vault_ids.length > 0) {
      const path = c.req.path;
      const vaultMatch = path.match(/\/vaults\/([0-9a-f-]+)/);
      if (vaultMatch) {
        const requestedVaultId = vaultMatch[1];
        if (!serviceToken.vault_ids.includes(requestedVaultId)) {
          throw Errors.forbidden();
        }
      }
    }

    // Validate permissions
    if (serviceToken.permissions && serviceToken.permissions.length > 0) {
      const method = c.req.method;
      const perms = serviceToken.permissions as string[];
      if (method === 'GET' && !perms.includes('read')) throw Errors.forbidden();
      if ((method === 'POST' || method === 'PUT') && !perms.includes('write')) throw Errors.forbidden();
      if (method === 'DELETE' && !perms.includes('delete')) throw Errors.forbidden();
    }

    return next();
  }

  // Otherwise, validate as Supabase JWT
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw Errors.unauthorized();
  }

  c.set('userId', user.id);
  c.set('userEmail', user.email || '');
  c.set('emailVerified', !!user.email_confirmed_at);
  return next();
});

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
