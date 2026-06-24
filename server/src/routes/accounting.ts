import { Router } from 'express';
import {
  postEntry,
  reverseEntry,
  getTrialBalance,
  getAccountLedger,
  listAccounts,
  listEntries,
  createAccount,
  deleteAccount,
} from '../controllers/accountingController';

const router = Router();

// Accounting posting engine — double-entry journal entries (first-class Prisma).
router.post('/post', postEntry);
router.post('/reverse', reverseEntry);

// Read-only ledger reporting (trial balance + per-account ledger).
router.get('/trial-balance', getTrialBalance);
router.get('/ledger', getAccountLedger);

// Chart of accounts management.
router.get('/accounts', listAccounts);
router.post('/accounts', createAccount);
router.delete('/accounts/:id', deleteAccount);

// Journal entry listing.
router.get('/entries', listEntries);

export default router;
