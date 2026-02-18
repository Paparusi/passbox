import { Hono } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';
import { getUserPlan, getUserUsage, getPlanLimits } from '../lib/plans.js';

type BillingEnv = {
  Variables: {
    userId: string;
  };
};

const billing = new Hono<BillingEnv>();

// ─── Get Current Plan & Usage ────────────────────
billing.get('/plan', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin();

  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);
  const usage = await getUserUsage(userId);

  // Get subscription details
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  return c.json({
    success: true,
    data: {
      plan,
      limits,
      usage,
      subscription: subscription || null,
    },
  });
});

// ─── Create Stripe Checkout Session ──────────────
billing.post('/checkout', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { plan } = body;

  if (!['pro', 'team'].includes(plan)) {
    throw Errors.badRequest('Invalid plan. Choose "pro" or "team".');
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw Errors.internal('Stripe not configured');
  }

  const supabase = getSupabaseAdmin();

  // Get or create Stripe customer
  let { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  // Get user email
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  const email = user?.email;

  let customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    // Create Stripe customer
    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: email || '',
        'metadata[user_id]': userId,
      }),
    });
    const customer = await customerRes.json();
    customerId = customer.id;

    // Save customer ID
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan: 'free',
      status: 'active',
      stripe_customer_id: customerId,
    }, { onConflict: 'user_id' });
  }

  // Price IDs from environment
  const priceId = plan === 'pro'
    ? process.env.STRIPE_PRO_PRICE_ID
    : process.env.STRIPE_TEAM_PRICE_ID;

  if (!priceId) {
    throw Errors.internal(`Stripe price not configured for ${plan}`);
  }

  const appUrl = process.env.APP_URL || 'https://passbox.dev';

  // Create checkout session
  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'customer': customerId!,
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${appUrl}/billing?success=true`,
      'cancel_url': `${appUrl}/billing?canceled=true`,
      'metadata[user_id]': userId,
      'metadata[plan]': plan,
    }),
  });

  const session = await sessionRes.json();

  if (session.error) {
    throw Errors.internal(session.error.message);
  }

  return c.json({ success: true, data: { url: session.url } });
});

// ─── Create Stripe Customer Portal Session ───────
billing.post('/portal', async (c) => {
  const userId = c.get('userId');
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    throw Errors.internal('Stripe not configured');
  }

  const supabase = getSupabaseAdmin();
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (!subscription?.stripe_customer_id) {
    throw Errors.badRequest('No billing account found');
  }

  const appUrl = process.env.APP_URL || 'https://passbox.dev';

  const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'customer': subscription.stripe_customer_id,
      'return_url': `${appUrl}/billing`,
    }),
  });

  const portal = await portalRes.json();

  if (portal.error) {
    throw Errors.internal(portal.error.message);
  }

  return c.json({ success: true, data: { url: portal.url } });
});

export { billing };
