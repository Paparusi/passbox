import { Hono } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';

const health = new Hono();

health.get('/', async (c) => {
  let dbOk = false;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('organizations').select('id', { count: 'exact', head: true });
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? 'ok' : 'degraded';
  return c.json({
    status,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'connected' : 'unreachable',
  }, dbOk ? 200 : 503);
});

export { health };
