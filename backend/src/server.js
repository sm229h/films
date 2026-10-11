import { createApp } from './app.js';
import { assertRuntimeConfig, config } from './config.js';
import { pool } from './db/pool.js';
import { purgeExpiredSessions } from './lib/auth.js';

assertRuntimeConfig();

const app = createApp();
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] CineVerse API listening on http://0.0.0.0:${config.port}`);
});

// Housekeeping: drop expired session rows periodically.
const cleanup = setInterval(() => {
  purgeExpiredSessions().catch((error) => console.error('[sessions]', error.message));
}, 60 * 60 * 1000);
cleanup.unref();

const shutdown = async (signal) => {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
