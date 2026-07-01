import { Router } from 'express';
import {
  postEntry,
  reverseEntry,
  getTrialBalance,
  getAccountLedger,
  getBalanceSheet,
  getIncomeStatement,
  listAccounts,
  listEntries,
  createAccount,
  deleteAccount,
  listPeriods,
  seedYear,
  openPeriod,
  softClosePeriod,
  hardClosePeriod,
  reopenPeriod,
} from '../controllers/accountingController';
import {
  documentAttachmentUpload,
  createDocumentAttachment,
  listDocumentAttachments,
  downloadDocumentAttachment,
  deleteDocumentAttachment,
} from '../controllers/documentAttachmentController';

const router = Router();

// Accounting posting engine — double-entry journal entries (first-class Prisma).
router.post('/post', postEntry);
router.post('/reverse', reverseEntry);

// Read-only ledger reporting (trial balance + per-account ledger + financial statements).
router.get('/trial-balance', getTrialBalance);
router.get('/ledger', getAccountLedger);
router.get('/balance-sheet', getBalanceSheet);
router.get('/income-statement', getIncomeStatement);

// Chart of accounts management.
router.get('/accounts', listAccounts);
router.post('/accounts', createAccount);
router.delete('/accounts/:id', deleteAccount);

// Journal entry listing.
router.get('/entries', listEntries);

// Documentary evidence / attachments on journal entries (BE-INCR-5).
router.post('/attachments', documentAttachmentUpload, createDocumentAttachment);
router.get('/attachments/:id', downloadDocumentAttachment);
router.delete('/attachments/:id', deleteDocumentAttachment);
router.get('/journal-entries/:journalEntryId/attachments', listDocumentAttachments);

// Accounting period management (INCR-1).
// NOTE: /:unitId/periods must come before /periods/:id routes to avoid param clash.
router.get('/:unitId/periods', listPeriods);
router.post('/:unitId/periods/seed-year', seedYear);
router.post('/periods/:id/open', openPeriod);
router.post('/periods/:id/soft-close', softClosePeriod);
router.post('/periods/:id/hard-close', hardClosePeriod);
router.post('/periods/:id/reopen', reopenPeriod);

export default router;
