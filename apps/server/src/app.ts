import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { AppError } from './lib/errors.js';
import { authMiddleware } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { authRateLimit, refreshRateLimit, apiRateLimit, waitlistRateLimit } from './middleware/rate-limit.js';
import { health } from './routes/health.js';
import { authPublic } from './routes/auth-public.js';
import { authProtected } from './routes/auth-protected.js';
import { vaults } from './routes/vaults.js';
import { secrets } from './routes/secrets.js';
import { sharing } from './routes/sharing.js';
import { audit } from './routes/audit.js';
import { billing } from './routes/billing.js';
import { webhook } from './routes/webhook.js';
import { waitlist } from './routes/waitlist.js';
import { admin } from './routes/admin.js';

const app = new Hono();

// ─── Global Middleware ─────────────────────────────
const allowedOrigins = [
  'https://passbox.dev',
  'https://www.passbox.dev',
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return allowedOrigins[0];
    if (allowedOrigins.includes(origin)) return origin;
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use('*', logger());
app.use('*', secureHeaders());

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

// ─── Public Auth Routes ─────────────────────────────
// Token refresh: 20 req/min (session maintenance, not security-sensitive)
app.use('/api/v1/auth/refresh', refreshRateLimit);
// Login/register/recover: 5 req/min (brute-force protection)
app.use('/api/v1/auth/*', authRateLimit);
app.route('/api/v1/auth', authPublic);

// ─── Public: Waitlist (rate limited: 10 req/min) ───
app.use('/api/v1/waitlist/*', waitlistRateLimit);
app.route('/api/v1/waitlist', waitlist);

// ─── Public: Stripe Webhook (no rate limit) ────────
app.route('/api/v1/webhook', webhook);

// ─── Protected Routes (rate limited: 60 req/min) ───
const protectedApp = new Hono();
protectedApp.use('*', apiRateLimit);
protectedApp.use('*', authMiddleware);
protectedApp.use('*', auditMiddleware);

// Mount protected routes
protectedApp.route('/vaults', vaults);
protectedApp.route('/vaults', secrets);
protectedApp.route('/vaults', sharing);
protectedApp.route('/audit', audit);
protectedApp.route('/billing', billing);
protectedApp.route('/auth', authProtected);
protectedApp.route('/admin', admin);

app.route('/api/v1', protectedApp);

export { app };
