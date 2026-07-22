import { Router } from 'express';
import {
  listLayouts,
  createLayout,
  getLayoutById,
  updateLayout,
  activateLayout,
  deleteLayout,
} from '@/controllers/dashboardLayoutController';

const router = Router();

// GET /api/dashboard-layout
router.get('/', listLayouts);

// POST /api/dashboard-layout
router.post('/', createLayout);

// GET /api/dashboard-layout/:id
router.get('/:id', getLayoutById);

// PATCH /api/dashboard-layout/:id
router.patch('/:id', updateLayout);

// POST /api/dashboard-layout/:id/activate
router.post('/:id/activate', activateLayout);

// DELETE /api/dashboard-layout/:id
router.delete('/:id', deleteLayout);

export default router;


