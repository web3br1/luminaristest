import { Router } from 'express';
import {
  listCounterparties,
  getCounterparty,
  createCounterparty,
  archiveCounterparty,
} from '../controllers/counterpartyController';

/**
 * Contraparte — fornecedor/cliente (INCR-COUNTERPARTY / A1). Mounted at `/api/counterparties`
 * (routes/index.ts). 3-touch registration: also add `/api/counterparties` to `protectedApiPaths`
 * (middleware/auth.ts) and, when documented, to the OpenAPI doc blocks. The static `:id/archive`
 * segment precedes nothing ambiguous; `:id` only ever captures a real id.
 */
const router = Router();

router.get('/', listCounterparties);
router.post('/', createCounterparty);
router.get('/:id', getCounterparty);
router.post('/:id/archive', archiveCounterparty);

export default router;
