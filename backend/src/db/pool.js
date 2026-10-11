import pg from 'pg';
import { config } from '../config.js';

// `numeric`/`int8` are returned as strings by the driver, which leaks into JSON
// responses. Normalise the ones we rely on.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

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
