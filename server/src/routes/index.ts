import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import documentRoutes from './documents';
import dynamicTableRoutes from './dynamic-tables';
import chatRoutes from './chat';
import chatInstanceRoutes from './chat-instances';
import chatMessageRoutes from './chat-messages';
import dashboardRoutes from './dashboard';
import dashboardLayoutRoutes from './dashboard-layout';
import structuredDataRoutes from './structured-data';
import reportRoutes from './reports';
import docsRoutes from './docs';
import analyticsRoutes from './analytics';
import analyticsDefinitionsRoutes from './analyticsDefinitions';
import crmRoutes from './crm';
import accountingRoutes from './accounting';
import salesRoutes from './sales';
import savedViewsRoutes from './saved-views';

const router = Router();

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'Luminaris API',
    version: '1.0.0',
    description: 'Document Intelligence Platform API',
    endpoints: {
      health: 'GET /health',
      auth: 'POST /api/auth/login, POST /api/auth/register, GET /api/auth/me, POST /api/auth/logout',
      users: 'GET /api/users',
      documents: 'GET/POST/PATCH/DELETE /api/documents/*',
      dynamicTables: 'GET/POST/PUT/DELETE /api/dynamic-tables/*',
      chat: 'POST /api/chat',
      chatInstances: 'GET/POST /api/chat-instances',
      chatMessages: 'GET/POST /api/chat-messages'
    },
  });
});

// Mount sub-routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/documents', documentRoutes);
router.use('/dynamic-tables', dynamicTableRoutes);
router.use('/chat', chatRoutes);
router.use('/chat-instances', chatInstanceRoutes);
router.use('/chat-messages', chatMessageRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/dashboard-layout', dashboardLayoutRoutes);
router.use('/structured-data', structuredDataRoutes);
router.use('/reports', reportRoutes);
router.use('/docs', docsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/analytics/definitions', analyticsDefinitionsRoutes);
router.use('/crm', crmRoutes);
router.use('/accounting', accountingRoutes);
router.use('/sales', salesRoutes);
router.use('/saved-views', savedViewsRoutes);

export { router };

