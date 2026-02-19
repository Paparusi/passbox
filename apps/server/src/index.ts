import { serve } from '@hono/node-server';
import { app } from './app.js';

// ─── Environment Validation ─────────────────────
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const port = parseInt(process.env.PORT || '3000');

console.log(`
  ____               ____
 |  _ \\ __ _ ___ ___| __ )  _____  __
 | |_) / _\` / __/ __|  _ \\ / _ \\ \\/ /
 |  __/ (_| \\__ \\__ \\ |_) | (_) >  <
 |_|   \\__,_|___/___/____/ \\___/_/\\_\\

 Zero-knowledge secrets management
 Server running on http://localhost:${port}
`);

const server = serve({ fetch: app.fetch, port });

// ─── Graceful Shutdown ──────────────────────────
function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
