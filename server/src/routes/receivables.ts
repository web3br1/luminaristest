import { Router } from 'express';
import {
  createReceivable,
  listReceivables,
  getReceivable,
  registerReceipt,
  cancelReceivable,
  cancelReceipt,
  reconcileReceivables,
} from '../controllers/receivableController';

/**
 * Contas a Receber (INCR-AR). Mounted at `/api/receivables` (routes/index.ts) — remember the 2-touch
 * registration: the mount plus the
 * OpenAPI doc blocks in docs.paths.ts (do NOT write the literal jsdoc-openapi tag in this prose — the
 * generator globs routes/ and would spread the comment string into the spec). `/reconcile` is
 * declared before the `/:id` routes so the static segment is never captured as an id.
 */
const router = Router();

router.post('/reconcile', reconcileReceivables);
router.post('/', createReceivable);
router.get('/', listReceivables);
router.get('/:id', getReceivable);
router.post('/:id/receive', registerReceipt);
router.post('/:id/cancel', cancelReceivable);
router.post('/:id/receipts/:receiptId/cancel', cancelReceipt);

export default router;
