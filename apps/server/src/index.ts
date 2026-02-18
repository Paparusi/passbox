import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './app.js';

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

serve({ fetch: app.fetch, port });
