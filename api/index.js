// Vercel serverless entry: the whole Express API runs as one function,
// and the Vite build is served as static files (see vercel.json).
// Same-origin, so no CORS and no cross-site cookie is needed.
import { createApp } from '../backend/src/app.js';
import { ensureDatabaseReady } from '../backend/src/db/init.js';

// First request applies migrations and seeds a fresh database; warm
// instances reuse the cached result and skip this entirely.
export const maxDuration = 60;

const app = createApp();

export default async function handler(req, res) {
  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.error('[api] database init failed:', error.message);
    res.status(503).json({
      error: {
        message: 'سرویس دیتابیس آماده نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.',
        code: 503,
      },
    });
    return;
  }
  return app(req, res);
}
