import { Hono } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

type AuditEnv = {
  Variables: {
    userId: string;
  };
};

const audit = new Hono<AuditEnv>();

audit.get('/', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin();

  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '50'), 100);
  const action = c.req.query('action');
  const resourceType = c.req.query('resourceType');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  // Get user's org IDs where they are admin+
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin']);

  if (!memberships || memberships.length === 0) {
    return c.json({
      success: true,
      data: { items: [], total: 0, page, pageSize, hasMore: false },
    });
  }

  const orgIds = memberships.map(m => m.org_id);

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .in('org_id', orgIds)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (action) query = query.eq('action', action);
  if (resourceType) query = query.eq('resource_type', resourceType);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data: logs, count, error } = await query;

  if (error) {
    throw Errors.internal(error.message);
  }

  return c.json({
    success: true,
    data: {
      items: logs || [],
      total: count || 0,
      page,
      pageSize,
      hasMore: (count || 0) > page * pageSize,
    },
  });
});

export { audit };
