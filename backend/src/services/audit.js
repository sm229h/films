import { query } from '../db/pool.js';

/**
 * Records an administrative or security-relevant action. Never throws: an
 * audit failure must not break the request that triggered it.
 */
export async function logAudit({ userId, action, entity, entityId, meta, ip }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId ?? null, action, entity ?? null, entityId ? String(entityId) : null,
        meta ? JSON.stringify(meta) : null, ip ?? null],
    );
  } catch (error) {
    console.error('[audit] failed', error.message);
  }
}
