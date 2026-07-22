import { Router } from 'express';
import {
  createPayable,
  listPayables,
  getPayable,
  registerPayment,
  cancelPayable,
  cancelPayment,
  reconcilePayables,
} from '../controllers/payableController';

/**
 * Contas a Pagar (INCR-AP). Mounted at `/api/payables` (routes/index.ts) — remember the 2-touch
 * registration: the mount plus the
 * OpenAPI doc blocks in docs.paths.ts (do NOT write the literal jsdoc-openapi tag in this prose —
 * the generator globs routes/ and would spread the comment string into `paths`). `/reconcile` is
 * declared before the `/:id` routes so the static segment is never captured as an id.
 */
const router = Router();

router.post('/reconcile', reconcilePayables);
router.post('/', createPayable);
router.get('/', listPayables);
router.get('/:id', getPayable);
router.post('/:id/pay', registerPayment);
router.post('/:id/cancel', cancelPayable);
router.post('/:id/payments/:paymentId/cancel', cancelPayment);

export default router;
