import { Router } from 'express';
import {
  listAnalyticsDefinitions,
  createAnalyticsDefinition,
  updateAnalyticsDefinition,
  deleteAnalyticsDefinition,
} from '@/controllers/analyticsDefinitionsController';

const router = Router();

router.get('/', listAnalyticsDefinitions);
router.post('/', createAnalyticsDefinition);
router.put('/:id', updateAnalyticsDefinition);
router.delete('/:id', deleteAnalyticsDefinition);

export default router;


