import { createMiddleware } from 'hono/factory';
import { getSupabaseAdmin } from '../lib/supabase.js';

type AuditEnv = {
  Variables: {
    userId: string;
    tokenId?: string;
  };
};

/**
 * Audit middleware: logs API actions for compliance and debugging.
 */
export const auditMiddleware = createMiddleware<AuditEnv>(async (c, next) => {
  await next();

  // Only log mutating requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return;

  const userId = c.get('userId');
  if (!userId) return;

  const path = new URL(c.req.url).pathname;
  const action = deriveAction(c.req.method, path);
  if (!action) return;

  const supabase = getSupabaseAdmin();
  await supabase.from('audit_logs').insert({
    user_id: userId,
    token_id: c.get('tokenId') || null,
    action: action.action,
    resource_type: action.resourceType,
    resource_id: action.resourceId,
    metadata: {
      method: c.req.method,
      path,
      ip: c.req.header('x-forwarded-for') || 'unknown',
      userAgent: c.req.header('user-agent') || 'unknown',
      status: c.res.status,
    },
  });
});

function deriveAction(method: string, path: string): {
  action: string;
  resourceType: string;
  resourceId?: string;
} | null {
  const parts = path.replace('/api/v1/', '').split('/');

  const methodMap: Record<string, string> = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };

  const verb = methodMap[method];
  if (!verb) return null;

  // /vaults/:vid/secrets/:name
  if (parts[0] === 'vaults' && parts[2] === 'secrets') {
    return {
      action: `secret.${verb}`,
      resourceType: 'secret',
      resourceId: parts[3],
    };
  }

  // /vaults/:id
  if (parts[0] === 'vaults') {
    return {
      action: `vault.${verb}`,
      resourceType: 'vault',
      resourceId: parts[1],
    };
  }

  // /auth/service-token
  if (parts[0] === 'auth' && parts[1] === 'service-token') {
    return {
      action: `token.${verb}`,
      resourceType: 'service_token',
      resourceId: parts[2],
    };
  }

  return {
    action: `${parts[0]}.${verb}`,
    resourceType: parts[0],
  };
}
