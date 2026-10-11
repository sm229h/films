import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const BCRYPT_ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export const newToken = () => crypto.randomBytes(32).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Issues a signed session token and records its `jti` in `user_sessions`.
 * The token alone is not enough to authenticate: the session row must exist,
 * which is what makes logout and account blocking effective.
 */
export async function createSession(user, { userAgent, ip } = {}) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.jwtTtlDays * 24 * 60 * 60 * 1000);

  const token = jwt.sign({ sub: String(user.id), role: user.role, jti }, config.jwtSecret, {
    expiresIn: `${config.jwtTtlDays}d`,
  });

  await query(
    `INSERT INTO user_sessions (user_id, jti, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, jti, userAgent?.slice(0, 255) || null, ip || null, expiresAt],
  );

  return { token, jti, expiresAt };
}

export const verifySessionToken = (token) => jwt.verify(token, config.jwtSecret);

export async function revokeSession(jti) {
  await query('DELETE FROM user_sessions WHERE jti = $1', [jti]);
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM user_sessions WHERE expires_at < now()');
}

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/',
});

export function setSessionCookie(res, token) {
  res.cookie(config.sessionCookieName, token, {
    ...sessionCookieOptions(),
    maxAge: config.jwtTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookieName, sessionCookieOptions());
}
