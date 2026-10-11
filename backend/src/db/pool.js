import pg from 'pg';
import { config } from '../config.js';

// `numeric`/`int8` are returned as strings by the driver, which leaks into JSON
// responses. Normalise the ones we rely on.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Serverless instances each hold their own pool — keep it small on Vercel
  // so concurrent instances can't exhaust the managed database.
  max: toInt(process.env.PG_POOL_MAX, process.env.VERCEL ? 3 : 10),
  idleTimeoutMillis: 30_000,
  // Fail fast instead of hanging a serverless invocation on a dead database.
  connectionTimeoutMillis: 8_000,
  // Managed Postgres (Neon / Vercel Postgres / Supabase pooler) terminates TLS
  // with certificates Node can't verify (self-signed chain). Local docker PG
  // has no TLS at all, so only enable SSL for remote hosts. Set
  // PG_SSL_VERIFY=1 to force strict verification.
  ...(isRemoteDatabase(config.databaseUrl)
    ? { ssl: { rejectUnauthorized: process.env.PG_SSL_VERIFY === '1' } }
    : {}),
});

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRemoteDatabase(connectionString = '') {
  try {
    const { hostname } = new URL(connectionString);
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
  } catch {
    return false;
  }
}

pool.on('error', (error) => {
  console.error('[db] idle client error', error.message);
});

/** Run a parameterised query. Always prefer this over string interpolation. */
export const query = (text, params) => pool.query(text, params);

/** Run several statements inside a transaction. */
export async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
