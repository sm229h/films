/**
 * Drops the whole schema and rebuilds it. Development convenience only —
 * never point this at a database you care about.
 */
import { pool } from './pool.js';
import { runMigrations } from './migrate.js';

async function main() {
  console.log('[reset] dropping schema public…');
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runMigrations();
  console.log('[reset] schema recreated. Run `npm run seed` next.');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(`[reset] failed: ${error.message}`);
    await pool.end();
    process.exit(1);
  });
