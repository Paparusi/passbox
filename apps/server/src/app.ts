import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AppError } from './lib/errors.js';
import { authMiddleware } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { health } from './routes/health.js';
import { auth } from './routes/auth.js';
import { vaults } from './routes/vaults.js';
import { secrets } from './routes/secrets.js';
import { sharing } from './routes/sharing.js';
import { audit } from './routes/audit.js';
import { billing } from './routes/billing.js';
import { webhook } from './routes/webhook.js';
import { waitlist } from './routes/waitlist.js';

const app = new Hono();

// ─── Global Middleware ─────────────────────────────
app.use('*', cors());
app.use('*', logger());

// ─── Error Handler ─────────────────────────────────
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { success: false, error: { code: err.code, message: err.message } },
      err.statusCode as any,
    );
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: err.message } },
      400,
    );
  }

  console.error('Unhandled error:', err);
  return c.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    500,
  );
});

// ─── Public Routes ─────────────────────────────────
app.route('/api/v1/health', health);

// ─── Auth Routes (partially public) ────────────────
app.route('/api/v1/auth', auth);

// ─── Public: Waitlist & Stripe Webhook ─────────────
app.route('/api/v1/waitlist', waitlist);
app.route('/api/v1/webhook', webhook);

// ─── Protected Routes ──────────────────────────────
const protectedApp = new Hono();
protectedApp.use('*', authMiddleware);
protectedApp.use('*', auditMiddleware);

// Mount protected routes
protectedApp.route('/vaults', vaults);
protectedApp.route('/vaults', secrets);
protectedApp.route('/vaults', sharing);
protectedApp.route('/audit', audit);
protectedApp.route('/billing', billing);

// Service token endpoints need auth too
protectedApp.route('/auth', auth);

app.route('/api/v1', protectedApp);

export { app };
