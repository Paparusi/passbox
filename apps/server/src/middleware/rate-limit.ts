import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

function getClientIp(c: any): string {
  // In production behind a trusted proxy (Railway), x-forwarded-for is reliable
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'no-ip'
  );
}

/**
 * Rate limiter factory.
 * @param maxRequests Max requests per window
 * @param windowMs Window duration in milliseconds
 * @param prefix Key prefix to separate different limiters
 */
export function rateLimiter(maxRequests: number, windowMs: number, prefix = 'rl') {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }

    return next();
  });
}

/** Strict: 5 requests per minute (login/register) */
export const authRateLimit = rateLimiter(5, 60 * 1000, 'auth');

/** Token refresh: 20 requests per minute (session maintenance) */
export const refreshRateLimit = rateLimiter(20, 60 * 1000, 'refresh');

/** Normal: 60 requests per minute (API endpoints) */
export const apiRateLimit = rateLimiter(60, 60 * 1000, 'api');

/** Relaxed: 10 requests per minute (waitlist) */
export const waitlistRateLimit = rateLimiter(10, 60 * 1000, 'waitlist');
