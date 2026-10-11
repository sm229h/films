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
    'postgres://cineverse:cineverse@localhost:5432/cineverse',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtTtlDays: toInt(process.env.JWT_TTL_DAYS, 7),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'cv_session',
  cookieSecure: process.env.COOKIE_SECURE === '1',

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
};

export function assertRuntimeConfig() {
  const problems = [];
  if (!config.jwtSecret || config.jwtSecret.length < 16) {
    problems.push('JWT_SECRET is missing or too short (min 16 characters).');
  }
  if (problems.length) {
    throw new Error(`Invalid runtime configuration:\n - ${problems.join('\n - ')}`);
  }
}
