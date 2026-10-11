import { config } from '../config.js';
import { runMigrations } from './migrate.js';
import { query } from './pool.js';
import { runSeed } from './seed.js';

/**
 * Zero-config boot for single-service deploys (Vercel, single Docker image).
 *
 * The first request applies pending migrations and, when the database is
 * completely fresh (no users yet), seeds the sample catalogue + demo accounts.
 * The result is cached globally so warm serverless instances pay this cost
 * exactly once. Seeding is idempotent and never runs when users exist, so it
 * can never wipe real data.
 */
let ready = null;

export function ensureDatabaseReady() {
  if (!ready) {
    ready = (async () => {
      await runMigrations({ log: () => {} });
      const { rows } = await query('SELECT COUNT(*)::int AS count FROM users');
      if (rows[0].count === 0) {
        console.log('[db] fresh database detected — seeding sample data…');
        await runSeed();
        console.log('[db] seed complete.');
      }
      return true;
    })().catch((error) => {
      // Allow the next request to retry instead of caching the failure.
      ready = null;
      if (config.databaseUrl.includes('localhost')) {
        console.error(
          '[db] cannot reach Postgres and no DATABASE_URL is configured. ' +
            'On Vercel, add a Postgres database (Storage → Create Database) ' +
            'so DATABASE_URL/POSTGRES_URL is provided automatically.',
        );
      }
      throw error;
    });
  }
  return ready;
}
