import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { json, urlencoded } from 'express';
import path from 'path';

// Routes
import { router as routes } from './routes';
import { authMiddleware } from './middleware/auth';
import { handleApiError } from './lib/apiUtils';
import prisma from './lib/prisma';

/**
 * Builds the fully-configured Express app (middlewares + routes + handlers) WITHOUT starting it.
 * `server.ts` calls this and `listen()`s; tests import the same app into supertest, so the HTTP
 * layer under test is byte-for-byte the one that runs in production.
 */
export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(helmet());
  // CORS restricted to the frontend origin (R21) — never open cors() in production.
  app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000', credentials: true }));
  app.use(compression({
    filter: (req, res) => {
      if (req.path.startsWith('/api/reports/generate-chart-data')) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Basic rate limiting (customize as needed)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000, // Relaxed from 300 for massive seed & dev usage
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Auth middleware
  app.use(authMiddleware);

  // Routes
  app.use('/api', routes);

  // Serve static OpenAPI if present
  app.use('/api/docs/static', express.static(path.join(process.cwd(), 'public')));

  // Health check (R19): pings DB and Qdrant, 503 when degraded.
  app.get('/health', async (req, res) => {
    const checks: Record<string, string> = {};

    // Database ping
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      checks.database = 'ok';
    } catch (err) {
      checks.database = 'error';
    }

    // Qdrant ping (only if QDRANT_URL is configured)
    if (process.env.QDRANT_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const qdrantRes = await fetch(`${process.env.QDRANT_URL}/healthz`, { signal: controller.signal });
        clearTimeout(timeoutId);
        checks.qdrant = qdrantRes.ok ? 'ok' : 'error';
      } catch {
        checks.qdrant = 'error';
      }
    } else {
      checks.qdrant = 'not_configured';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'not_configured');
    const status = allOk ? 'ok' : 'degraded';

    return res.status(allOk ? 200 : 503).json({
      status,
      uptime: process.uptime(),
      checks,
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      message: `${req.method} ${req.originalUrl} not found`
    });
  });

  // Centralized error handler: any error reaching Express (thrown in sync middleware or passed to
  // next(err)) is mapped to the standard { code, message } envelope via handleApiError — consistent
  // with the per-controller catches. The 4-arg signature is what marks this as an error handler;
  // `_next` is required even though unused.
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    handleApiError(error, res);
  });

  return app;
}

const app = createApp();

export default app;
