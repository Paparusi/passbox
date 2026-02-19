import { Hono } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { adminMiddleware } from '../middleware/admin.js';

type AdminEnv = {
  Variables: {
    userId: string;
  };
};

const admin = new Hono<AdminEnv>();

// Apply admin middleware to all admin routes
admin.use('*', adminMiddleware);

// ─── Check if current user is admin ──────────────
admin.get('/check', async (c) => {
  return c.json({ success: true, data: { isAdmin: true } });
});

// ─── Overview Stats ──────────────────────────────
admin.get('/stats', async (c) => {
  const supabase = getSupabaseAdmin();

  const [userKeysRes, vaultsRes, secretsRes, orgsRes, waitlistRes, subsRes] = await Promise.all([
    supabase.from('user_keys').select('*', { count: 'exact', head: true }),
    supabase.from('vaults').select('*', { count: 'exact', head: true }),
    supabase.from('secrets').select('*', { count: 'exact', head: true }),
    supabase.from('organizations').select('*', { count: 'exact', head: true }),
    supabase.from('waitlist').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('plan').eq('status', 'active'),
  ]);

  const planBreakdown: Record<string, number> = { free: 0, pro: 0, team: 0, enterprise: 0 };
  if (subsRes.data) {
    for (const sub of subsRes.data) {
      planBreakdown[sub.plan] = (planBreakdown[sub.plan] || 0) + 1;
    }
  }

  return c.json({
    success: true,
    data: {
      totalUsers: userKeysRes.count || 0,
      totalVaults: vaultsRes.count || 0,
      totalSecrets: secretsRes.count || 0,
      totalOrgs: orgsRes.count || 0,
      waitlistCount: waitlistRes.count || 0,
      subscriptions: planBreakdown,
    },
  });
});

// ─── List All Users ──────────────────────────────
admin.get('/users', async (c) => {
  const supabase = getSupabaseAdmin();
  const page = parseInt(c.req.query('page') || '1');
  const perPage = Math.min(parseInt(c.req.query('perPage') || '50'), 100);

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page,
    perPage,
  });

  if (authError) {
    throw Errors.internal(authError.message);
  }

  const users = authData?.users || [];
  const userIds = users.map(u => u.id);

  // Get subscription data for these users
  const { data: subs } = userIds.length > 0
    ? await supabase.from('subscriptions').select('user_id, plan, status').in('user_id', userIds)
    : { data: [] };

  // Get vault counts per user
  const { data: vaultCounts } = userIds.length > 0
    ? await supabase.from('vault_members').select('user_id').in('user_id', userIds).eq('role', 'owner')
    : { data: [] };

  const subMap = new Map((subs || []).map(s => [s.user_id, s]));
  const vaultCountMap = new Map<string, number>();
  for (const vm of (vaultCounts || [])) {
    vaultCountMap.set(vm.user_id, (vaultCountMap.get(vm.user_id) || 0) + 1);
  }

  const enrichedUsers = users.map(u => ({
    id: u.id,
    email: u.email || '',
    plan: subMap.get(u.id)?.plan || 'free',
    planStatus: subMap.get(u.id)?.status || 'active',
    vaultCount: vaultCountMap.get(u.id) || 0,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at || null,
  }));

  return c.json({
    success: true,
    data: {
      users: enrichedUsers,
      page,
      perPage,
      hasMore: users.length === perPage,
    },
  });
});

// ─── Change User Plan ────────────────────────────
admin.put('/users/:id/plan', async (c) => {
  const targetUserId = c.req.param('id');
  const body = await c.req.json();
  const { plan } = body;

  if (!['free', 'pro', 'team', 'enterprise'].includes(plan)) {
    throw Errors.badRequest('Invalid plan. Must be free, pro, team, or enterprise.');
  }

  const supabase = getSupabaseAdmin();

  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(targetUserId);
  if (userError || !user) {
    throw Errors.notFound('User');
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: targetUserId,
      plan,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    throw Errors.internal(error.message);
  }

  return c.json({ success: true, data: { userId: targetUserId, plan } });
});

// ─── List Waitlist Entries ───────────────────────
admin.get('/waitlist', async (c) => {
  const supabase = getSupabaseAdmin();
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '50'), 100);

  const { data, count, error } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    throw Errors.internal(error.message);
  }

  return c.json({
    success: true,
    data: {
      items: data || [],
      total: count || 0,
      page,
      pageSize,
      hasMore: (count || 0) > page * pageSize,
    },
  });
});

// ─── Delete Waitlist Entry ───────────────────────
admin.delete('/waitlist/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('waitlist')
    .delete()
    .eq('id', id);

  if (error) {
    throw Errors.internal(error.message);
  }

  return c.json({ success: true, data: { deleted: id } });
});

export { admin };
