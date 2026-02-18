import { Hono } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';

const webhook = new Hono();

// ─── Stripe Webhook ──────────────────────────────
webhook.post('/stripe', async (c) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) {
    return c.json({ error: 'Stripe not configured' }, 500);
  }

  const body = await c.req.text();

  // In production, verify webhook signature with webhookSecret
  // For now, parse the event directly
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan;

      if (userId && plan) {
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          plan,
          status: 'active',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          current_period_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const customerId = sub.customer;

      const { data: existing } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (existing) {
        await supabase.from('subscriptions').update({
          status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', existing.user_id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customerId = sub.customer;

      await supabase.from('subscriptions').update({
        plan: 'free',
        status: 'active',
        stripe_subscription_id: null,
        cancel_at_period_end: false,
        current_period_start: null,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      await supabase.from('subscriptions').update({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId);
      break;
    }
  }

  return c.json({ received: true });
});

export { webhook };
