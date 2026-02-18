import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

const waitlist = new Hono();

const joinSchema = z.object({
  email: z.string().email(),
  source: z.string().optional(),
});

// ─── Join Waitlist (public) ──────────────────────
waitlist.post('/', async (c) => {
  const body = await c.req.json();
  const data = joinSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('waitlist').insert({
    email: data.email,
    source: data.source || 'website',
  });

  if (error) {
    if (error.code === '23505') {
      // Already on waitlist — return success anyway
      return c.json({ success: true, data: { message: 'Already on the waitlist!' } });
    }
    throw Errors.internal(error.message);
  }

  return c.json({ success: true, data: { message: 'Welcome to the waitlist!' } }, 201);
});

// ─── Get Waitlist Count (public) ─────────────────
waitlist.get('/count', async (c) => {
  const supabase = getSupabaseAdmin();

  const { count } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true });

  return c.json({ success: true, data: { count: count || 0 } });
});

export { waitlist };
