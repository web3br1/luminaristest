import { Router } from 'express';
import {
  createDashboard,
  getDashboardData,
  getDashboardPresets,
  getDashboardPresetByKey,
  getDashboardSidebar,
  deleteUserSystem,
} from '@/controllers/dashboardController';
import { postChatInterview } from '@/controllers/interviewController';

const router = Router();

// Mirrors Next.js routes:
// POST /api/dashboard/create
router.post('/create', createDashboard);

// GET /api/dashboard/data
router.get('/data', getDashboardData);

// GET /api/dashboard/presets
router.get('/presets', getDashboardPresets);

// GET /api/dashboard/presets/:presetKey
router.get('/presets/:presetKey', getDashboardPresetByKey);

// GET /api/dashboard/sidebar
router.get('/sidebar', getDashboardSidebar);

// DELETE /api/dashboard/system
router.delete('/system', deleteUserSystem);

// POST /api/dashboard/ai/ChatInterview — AI onboarding interview (R28)
// Auth is enforced inside the controller via getUserContextFromRequest.
router.post('/ai/ChatInterview', postChatInterview);

export default router;


