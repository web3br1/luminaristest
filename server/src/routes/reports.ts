import { Router } from 'express';
import { generateChartData } from '@/controllers/reportsController';

const router = Router();

// POST /api/reports/generate-chart-data (SSE)
router.post('/generate-chart-data', generateChartData);

export default router;


