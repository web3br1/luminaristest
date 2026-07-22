import { Router } from 'express';
import {
  listDimensions,
  createDefinition,
  archiveDefinition,
  createValue,
  archiveValue,
  balanceByDimension,
  resultByDimension,
} from '../controllers/dimensionController';

/**
 * Dimensões — centro de custo/projeto (INCR-DIM). Mounted at `/api/dimensions` (routes/index.ts).
 * 2-touch registration: the mount plus the
 * OpenAPI doc blocks in docs.paths.ts (do NOT write the literal jsdoc-openapi tag in this prose — the
 * generator globs routes/ and would spread the comment string into the spec). Static segments
 * (`/definitions`, `/values`, `/reports`) precede any `:id` so they are never captured as ids.
 */
const router = Router();

// Catalog
router.get('/', listDimensions);
router.post('/definitions', createDefinition);
router.post('/definitions/:id/archive', archiveDefinition);
router.post('/values', createValue);
router.post('/values/:id/archive', archiveValue);

// Reports (Fatia 3)
router.get('/reports/balance', balanceByDimension);
router.get('/reports/result', resultByDimension);

export default router;
