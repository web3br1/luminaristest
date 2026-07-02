import { Router } from 'express';
import { cancelSale, returnSale, registerPayment } from '../controllers/salesController';

const router = Router();

// Salon-sale lifecycle transitions (Incremento D) — server-orchestrated state moves out of
// the Finalized terminal state, each followed by a post-commit accounting effect.
router.post('/cancel', cancelSale);
router.post('/return', returnSale);
// Payment registration (D1): Finalized → Paid via a whitelisted isSystem write, then settle.
router.post('/pay', registerPayment);

export default router;
