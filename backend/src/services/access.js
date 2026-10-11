import { query } from '../db/pool.js';
import { forbidden, notFound } from '../lib/http-error.js';

/** Returns the user's currently active subscription, or null. */
export async function getActiveSubscription(userId) {
  const { rows } = await query(
    `SELECT us.id, us.status, us.starts_at, us.ends_at, p.code, p.name_fa, p.duration_days
       FROM user_subscriptions us
       JOIN subscription_plans p ON p.id = us.plan_id
      WHERE us.user_id = $1 AND us.status = 'active' AND us.ends_at > now()
      ORDER BY us.ends_at DESC
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function hasActiveSubscription(userId) {
  if (!userId) return false;
  return Boolean(await getActiveSubscription(userId));
}

/**
 * Server-side gate for premium content. The client never decides this: the
 * playlist endpoint returns 403 unless the caller may watch.
 */
export async function assertCanWatch(user, content) {
  if (content.access === 'free') return;
  if (user?.role === 'admin') return;
  if (!user) throw forbidden('برای تماشای این محتوا ابتدا وارد حساب خود شوید.');
  if (!(await hasActiveSubscription(user.id))) {
    throw forbidden('این محتوا ویژه مشترکان است. برای تماشا اشتراک تهیه کنید.');
  }
}

export async function findContentBySlugOrId(identifier) {
  const numeric = /^\d+$/.test(String(identifier));
  const { rows } = await query(
    `SELECT * FROM content WHERE ${numeric ? 'id = $1' : 'slug = $1'}`,
    [numeric ? Number(identifier) : identifier],
  );
  if (!rows[0]) throw notFound('محتوا پیدا نشد.');
  return rows[0];
}
