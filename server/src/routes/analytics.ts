import { Router } from 'express';
import {
  getAnalyticsPresets,
  getAnalyticsData,
  getPresetAnalyticsPresets,
  getPresetAnalyticsData,
  getChartDetails,
  discoverTableKPIs,
  getDrillDownData,
} from '@/controllers/analyticsController';
import { executeCustomKpisHandler } from '@/controllers/customKpiController';

const router = Router();

// POST /api/analytics/custom-kpis
router.post('/custom-kpis', executeCustomKpisHandler);

// GET /api/analytics/drill-down
router.get('/drill-down', getDrillDownData);

// GET /api/analytics/presets
router.get('/presets', getAnalyticsPresets);
// GET /api/analytics/data?key=...&tableId=...
router.get('/data', getAnalyticsData);

// GET /api/analytics/presets/:presetKey
router.get('/presets/:presetKey', getPresetAnalyticsPresets);
// GET /api/analytics/presets/:presetKey/data?key=...
router.get('/presets/:presetKey/data', getPresetAnalyticsData);

// GET /api/analytics/chart/:chartKey/details
router.get('/chart/:chartKey/details', getChartDetails);

// GET /api/analytics/discover/:tableId
router.get('/discover/:tableId', discoverTableKPIs);

export default router;
