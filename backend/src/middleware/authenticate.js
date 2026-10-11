import { config } from '../config.js';
import { query } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { verifySessionToken } from '../lib/auth.js';

const extractToken = (req) => {
  const fromCookie = req.cookies?.[config.sessionCookieName];
  if (fromCookie) return fromCookie;

  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
};

const loadUser = async (token) => {
  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return null;
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_blocked, s.jti
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.jti = $1 AND s.expires_at > now()`,
    [payload.jti],
  );
  const row = rows[0];
  if (!row || row.is_blocked) return null;
  return row;
};

/** Attaches `req.user` when a valid session exists; never rejects. */
export async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    req.user = token ? await loadUser(token) : null;
    req.sessionJti = req.user?.jti ?? null;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const requireAdmin = requireRole('admin', 'support');
export const requireStrictAdmin = requireRole('admin');
