import { Router } from 'express';
import { listPackageBalances } from '../controllers/packageBalanceController';

const router = Router();

// Prepaid-package balances (Incremento G) — read-only; credit/debit are internal.
router.get('/', listPackageBalances);

export default router;
