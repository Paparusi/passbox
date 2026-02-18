import { createMiddleware } from 'hono/factory';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

type AuthEnv = {
  Variables: {
    userId: string;
    userEmail: string;
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
    c.set('tokenId', serviceToken.id);
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
