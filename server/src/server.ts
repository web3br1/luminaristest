import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { json, urlencoded } from 'express';

// Routes
import { router as routes } from './routes';
import { authMiddleware } from './middleware/auth';
import path from 'path';
import prisma from './lib/prisma';
import { logger } from './lib/logger';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
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

// Health check
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

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
const httpServer = app.listen(PORT, () => {
  console.log(`Luminaris Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
function gracefulShutdown() {
  logger.info('Shutting down gracefully...');

  // Force-exit safety net after 10 seconds
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit', {});
    process.exit(1);
  }, 10000);
  // Allow the timer to be garbage-collected if shutdown completes in time
  if (forceExitTimer.unref) forceExitTimer.unref();

  httpServer.close(() => {
    logger.info('HTTP server closed');
    prisma.$disconnect().then(() => {
      logger.info('Database disconnected');
      process.exit(0);
    }).catch((err) => {
      logger.error('Error disconnecting database', { err });
      process.exit(1);
    });
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason });
  // do NOT exit — log and continue to avoid crashing on transient failures
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception — shutting down', { error });
  gracefulShutdown();
});

export default app;
