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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
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
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Luminaris Server is running!'
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
app.listen(PORT, () => {
  console.log(`🚀 Luminaris Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;
