import crypto from 'node:crypto';
import 'dotenv/config';

const toInt = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function resolveJwtSecret() {
  const raw = process.env.JWT_SECRET || '';
  if (raw.length >= 16) return raw;
  if (raw) {
    console.warn(
      '[config] JWT_SECRET is too short (<16 chars) and will be ignored — ' +
        'using an ephemeral secret. Sessions reset on restart.',
    );
  } else {
    console.warn(
      '[config] JWT_SECRET is not set — using an ephemeral secret. ' +
        'Set JWT_SECRET (min 16 chars) for stable logins.',
    );
  }
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Central runtime configuration. Every value can be overridden through the
 * environment; nothing here is a real credential.
 */
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 8000),
  logLevel: process.env.LOG_LEVEL || 'dev',

  databaseUrl:
    process.env.DATABASE_URL ||
    // Vercel Postgres integration provides these automatically — prefer the
    // pooled connection string for serverless.
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    'postgres://cineverse:cineverse@localhost:5432/cineverse',

  // Zero-config boot: when no usable secret is provided, an ephemeral one is
  // generated (logins reset on restart). Set JWT_SECRET for stable sessions.
  jwtSecret: resolveJwtSecret(),
  jwtTtlDays: toInt(process.env.JWT_TTL_DAYS, 7),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'cv_session',
  cookieSecure: process.env.COOKIE_SECURE === '1',

  /**
   * Cookie SameSite mode: 'lax' (default, single-origin) or 'none'
   * (split deploy: frontend on a different origin than the API).
   * `SameSite=None` requires `Secure`, so it is force-enabled below.
   */
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),

  /**
   * Allowed CORS origins. Empty means "same-origin only" (the web dev server
   * proxies /api, so no cross-origin request is needed).
   */
  corsOrigins: toList(process.env.CORS_ORIGINS),
  trustProxy: process.env.TRUST_PROXY !== '0',

  /** Optional third-party metadata provider. */
  tmdbApiKey: process.env.TMDB_API_KEY || '',
  tmdbBaseUrl: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',

  /** Payment gateway selector — 'sandbox' never charges a real card. */
  paymentProvider: process.env.PAYMENT_PROVIDER || 'sandbox',
  paymentSandboxEnabled: process.env.PAYMENT_SANDBOX_ENABLED !== '0',

  /** Sandbox preview flag supplied by the platform. */
  previewMode: process.env.BASE44_PREVIEW_MODE === '1',

  /**
   * Optional single-service deploy: when set (or when the directory exists),
   * the API also serves the built frontend (SPA fallback, API routes excluded).
   */
  serveFrontend:
    process.env.SERVE_FRONTEND === '1' || process.env.SERVE_FRONTEND === 'true',
  frontendDistDir: process.env.FRONTEND_DIST_DIR || '',
};

export function assertRuntimeConfig() {
  const problems = [];
  if (!config.jwtSecret || config.jwtSecret.length < 16) {
    problems.push('JWT_SECRET is missing or too short (min 16 characters).');
  }
  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) {
    problems.push('COOKIE_SAMESITE must be one of: lax, strict, none.');
  }
  if (problems.length) {
    throw new Error(`Invalid runtime configuration:\n - ${problems.join('\n - ')}`);
  }
}
