import { Router } from 'express';
import {
  listSavedViews,
  createSavedView,
  updateSavedView,
  deleteSavedView,
} from '@/controllers/savedViewsController';

const router = Router();

// GET /api/saved-views?tableId=
router.get('/', listSavedViews);

// POST /api/saved-views
router.post('/', createSavedView);

// PATCH /api/saved-views/:id
router.patch('/:id', updateSavedView);

// DELETE /api/saved-views/:id
router.delete('/:id', deleteSavedView);

export default router;
