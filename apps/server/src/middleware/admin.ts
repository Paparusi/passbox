import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors.js';

type AdminEnv = {
  Variables: {
    userId: string;
  };
};

export const adminMiddleware = createMiddleware<AdminEnv>(async (c, next) => {
  const userId = c.get('userId');
  const adminIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (!adminIds.includes(userId)) {
    throw Errors.forbidden();
  }

  return next();
});
