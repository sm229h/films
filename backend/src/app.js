import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { router as apiV1 } from './routes/index.js';
import { getPublicSiteInfo } from './services/settings.js';

export function createApp() {
  const app = express();

  // Behind the preview proxy (and any reverse proxy in production) the real
  // client IP arrives in X-Forwarded-For and must be trusted for rate limiting.
  if (config.trustProxy) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(
    helmet({
      // The API only serves JSON; CSP is enforced by the web app itself.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests (via the dev-server proxy) carry no Origin.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
  app.use(morgan(config.logLevel, { skip: (req) => req.path === '/api/v1/health' }));
  app.use(globalLimiter);
  app.use(authenticate);

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  // Static assets the API owns (sample subtitle files, etc.). Served through the
  // same /api prefix so the web dev server's proxy covers them too.
  app.use(
    '/api/v1/static',
    express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public'), {
      maxAge: '1h',
      fallthrough: true,
    }),
  );

  app.get('/api/v1/site', async (req, res, next) => {
    try {
      res.json(await getPublicSiteInfo());
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/v1', apiV1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
