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

admin.use('*', adminMiddleware);

// ─── Check if current user is admin ──────────────
admin.get('/check', async (c) => {
  return c.json({ success: true, data: { isAdmin: true } });
});

// ─── Overview Stats ──────────────────────────────
admin.get('/stats', async (c) => {
  const supabase = getSupabaseAdmin();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    userKeysRes, vaultsRes, secretsRes, orgsRes, waitlistRes, subsRes,
    serviceTokensRes, auditLogsRes, vaultMembersRes, secretVersionsRes,
    recentKeysRes,
  ] = await Promise.all([
    supabase.from('user_keys').select('*', { count: 'exact', head: true }),
    supabase.from('vaults').select('*', { count: 'exact', head: true }),
    supabase.from('secrets').select('*', { count: 'exact', head: true }),
    supabase.from('organizations').select('*', { count: 'exact', head: true }),
    supabase.from('waitlist').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('plan').eq('status', 'active'),
    supabase.from('service_tokens').select('*', { count: 'exact', head: true }),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
    supabase.from('vault_members').select('*', { count: 'exact', head: true }),
    supabase.from('secret_versions').select('*', { count: 'exact', head: true }),
    supabase.from('user_keys').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
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
      totalServiceTokens: serviceTokensRes.count || 0,
      totalAuditLogs: auditLogsRes.count || 0,
      totalVaultMembers: vaultMembersRes.count || 0,
      totalSecretVersions: secretVersionsRes.count || 0,
      recentSignups: recentKeysRes.count || 0,
      subscriptions: planBreakdown,
    },
  });
});

// ─── Recent Activity ─────────────────────────────
admin.get('/activity', async (c) => {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(parseInt(c.req.query('limit') || '15'), 50);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw Errors.internal(error.message);
  }

  // Enrich with user emails
  const userIds = [...new Set((data || []).map(l => l.user_id).filter(Boolean))];
  const emailMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: keys } = await supabase
      .from('user_keys')
      .select('user_id')
      .in('user_id', userIds);

    // Get emails from Supabase Auth
    for (const uid of userIds) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(uid);
        if (user?.email) emailMap.set(uid, user.email);
      } catch {}
    }
  }

  const enrichedLogs = (data || []).map(log => ({
    id: log.id,
    action: log.action,
    resourceType: log.resource_type,
    resourceId: log.resource_id,
    userId: log.user_id,
    userEmail: emailMap.get(log.user_id) || null,
    metadata: log.metadata,
    createdAt: log.created_at,
  }));

  return c.json({ success: true, data: enrichedLogs });
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

  // Get subscription, vault, secret, service token data in parallel
  const [subsRes, vaultCountsRes, secretCountsRes, tokenCountsRes] = userIds.length > 0
    ? await Promise.all([
        supabase.from('subscriptions').select('user_id, plan, status').in('user_id', userIds),
        supabase.from('vault_members').select('user_id').in('user_id', userIds).eq('role', 'owner'),
        supabase.from('secrets').select('created_by').in('created_by', userIds),
        supabase.from('service_tokens').select('user_id').in('user_id', userIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const subMap = new Map((subsRes.data || []).map(s => [s.user_id, s]));

  const vaultCountMap = new Map<string, number>();
  for (const vm of (vaultCountsRes.data || [])) {
    vaultCountMap.set(vm.user_id, (vaultCountMap.get(vm.user_id) || 0) + 1);
  }

  const secretCountMap = new Map<string, number>();
  for (const s of (secretCountsRes.data || [])) {
    secretCountMap.set(s.created_by, (secretCountMap.get(s.created_by) || 0) + 1);
  }

  const tokenCountMap = new Map<string, number>();
  for (const t of (tokenCountsRes.data || [])) {
    tokenCountMap.set(t.user_id, (tokenCountMap.get(t.user_id) || 0) + 1);
  }

  const enrichedUsers = users.map(u => ({
    id: u.id,
    email: u.email || '',
    provider: u.app_metadata?.provider || 'email',
    emailVerified: !!u.email_confirmed_at,
    plan: subMap.get(u.id)?.plan || 'free',
    planStatus: subMap.get(u.id)?.status || 'active',
    vaultCount: vaultCountMap.get(u.id) || 0,
    secretCount: secretCountMap.get(u.id) || 0,
    tokenCount: tokenCountMap.get(u.id) || 0,
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

// ─── Delete User ─────────────────────────────────
admin.delete('/users/:id', async (c) => {
  const targetUserId = c.req.param('id');
  const adminUserId = c.get('userId');
  const supabase = getSupabaseAdmin();

  if (targetUserId === adminUserId) {
    throw Errors.badRequest('Cannot delete your own account from admin panel');
  }

  // Cascade delete: same pattern as account self-deletion
  const { data: memberships } = await supabase
    .from('vault_members')
    .select('vault_id')
    .eq('user_id', targetUserId);

  const vaultIds = memberships?.map(m => m.vault_id) || [];

  if (vaultIds.length > 0) {
    await supabase.from('secret_versions').delete().in('secret_id',
      supabase.from('secrets').select('id').in('vault_id', vaultIds) as any
    );
    await supabase.from('secrets').delete().in('vault_id', vaultIds);
    await supabase.from('vault_members').delete().in('vault_id', vaultIds);
    await supabase.from('vaults').delete().in('id', vaultIds);
  }

  await supabase.from('vault_members').delete().eq('user_id', targetUserId);
  await supabase.from('service_tokens').delete().eq('user_id', targetUserId);
  await supabase.from('audit_logs').delete().eq('user_id', targetUserId);
  await supabase.from('user_keys').delete().eq('user_id', targetUserId);

  const { data: userOrgs } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', targetUserId);

  await supabase.from('org_members').delete().eq('user_id', targetUserId);

  if (userOrgs) {
    for (const { org_id } of userOrgs) {
      const { count } = await supabase
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org_id);
      if (count === 0) {
        await supabase.from('organizations').delete().eq('id', org_id);
      }
    }
  }

  await supabase.from('subscriptions').delete().eq('user_id', targetUserId);
  await supabase.auth.admin.deleteUser(targetUserId);

  return c.json({ success: true, data: { deleted: targetUserId } });
});

// ─── Revenue / Stripe Stats ─────────────────────
admin.get('/revenue', async (c) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return c.json({
      success: true,
      data: {
        configured: false,
        balance: { available: 0, pending: 0, currency: 'usd' },
        mrr: 0,
        totalRevenue: 0,
        recentCharges: [],
      },
    });
  }

  const stripeGet = async (path: string) => {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    });
    return res.json();
  };

  // Fetch balance, recent charges, and active subscriptions in parallel
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

  const [balanceData, chargesData, subsData, invoicesData] = await Promise.all([
    stripeGet('/balance'),
    stripeGet(`/charges?limit=20&created[gte]=${thirtyDaysAgo}`),
    stripeGet('/subscriptions?status=active&limit=100'),
    stripeGet(`/invoices?status=paid&limit=100&created[gte]=${thirtyDaysAgo}`),
  ]);

  // Balance
  const available = balanceData.available?.reduce((sum: number, b: any) => sum + b.amount, 0) || 0;
  const pending = balanceData.pending?.reduce((sum: number, b: any) => sum + b.amount, 0) || 0;
  const currency = balanceData.available?.[0]?.currency || 'usd';

  // MRR from active subscriptions
  let mrr = 0;
  if (subsData.data) {
    for (const sub of subsData.data) {
      for (const item of sub.items?.data || []) {
        const amount = item.price?.unit_amount || 0;
        const interval = item.price?.recurring?.interval;
        if (interval === 'month') mrr += amount;
        else if (interval === 'year') mrr += Math.round(amount / 12);
      }
    }
  }

  // Total revenue this month from paid invoices
  let totalRevenue = 0;
  if (invoicesData.data) {
    for (const inv of invoicesData.data) {
      totalRevenue += inv.amount_paid || 0;
    }
  }

  // Recent charges
  const recentCharges = (chargesData.data || []).slice(0, 10).map((ch: any) => ({
    id: ch.id,
    amount: ch.amount,
    currency: ch.currency,
    status: ch.status,
    description: ch.description || ch.statement_descriptor || '',
    customerEmail: ch.billing_details?.email || ch.receipt_email || '',
    created: new Date(ch.created * 1000).toISOString(),
  }));

  return c.json({
    success: true,
    data: {
      configured: true,
      balance: { available, pending, currency },
      mrr,
      totalRevenue,
      activeSubscriptions: subsData.data?.length || 0,
      recentCharges,
    },
  });
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
