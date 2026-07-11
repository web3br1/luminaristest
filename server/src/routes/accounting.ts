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
import {
  bankStatementUpload,
  importBankStatement,
  listBankStatements,
  listBankStatementLines,
  deleteBankStatement,
  autoMatchBankStatement,
  getLineSuggestions,
  createManualMatch,
  unmatchReconciliation,
  setLineIgnored,
  getPendingReport,
} from '../controllers/reconciliationController';
import {
  createDataExchangeExport,
  getDataExchangeJob,
  downloadDataExchangeArtifact,
  dataExchangeImportUpload,
  createDataExchangeImport,
  listDataExchangeRows,
  commitDataExchangeImport,
} from '../controllers/dataExchangeController';
import {
  setReferentialMapping,
  unsetReferentialMapping,
  listReferentialMappings,
  getReferentialCoverage,
  batchSetReferentialMappings,
  copyReferentialMappingVersion,
  getReferentialSkeleton,
} from '../controllers/referentialMappingController';
import { generateSpedEcd } from '../controllers/spedController';
import { closeExercise } from '../controllers/closingController';

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

// Data Exchange — CSV/XLSX import + report export (BE-INCR-6).
router.post('/data-exchange/exports', createDataExchangeExport);
router.post('/data-exchange/imports', dataExchangeImportUpload, createDataExchangeImport);
router.get('/data-exchange/jobs/:jobId', getDataExchangeJob);
router.get('/data-exchange/jobs/:jobId/rows', listDataExchangeRows);
router.get('/data-exchange/jobs/:jobId/download', downloadDataExchangeArtifact);
router.post('/data-exchange/jobs/:jobId/commit', commitDataExchangeImport);

// SPED Contábil (ECD) — generate the `.txt` file (download reuses the job route above).
router.post('/sped/ecd/generate', generateSpedEcd);

// Year-end result closing (encerramento/apuração do resultado, BE-INCR-SPED-APURACAO).
// Reopening = reverse the returned entry via POST /reverse (frees the idempotency key).
router.post('/closing/exercise', closeExercise);

// Bank reconciliation — statement import, match/unmatch, pending report (BE-INCR-7).
router.post('/reconciliation/statements', bankStatementUpload, importBankStatement);
router.get('/reconciliation/statements', listBankStatements);
router.get('/reconciliation/statements/:id/lines', listBankStatementLines);
router.delete('/reconciliation/statements/:id', deleteBankStatement);
router.post('/reconciliation/statements/:id/auto-match', autoMatchBankStatement);
router.get('/reconciliation/lines/:id/suggestions', getLineSuggestions);
router.post('/reconciliation/lines/:id/ignore', setLineIgnored);
router.post('/reconciliation/matches', createManualMatch);
router.post('/reconciliation/matches/:id/unmatch', unmatchReconciliation);
router.get('/reconciliation/pending', getPendingReport);

// Referential chart mapping — versioned Account→RFB code + coverage diagnostic (BE-INCR-9).
// Batch/copy authoring + chart-driven skeleton (BE-INCR-9B Track A).
router.put('/referential/mappings', setReferentialMapping);
router.post('/referential/mappings/batch', batchSetReferentialMappings);
router.post('/referential/mappings/copy', copyReferentialMappingVersion);
router.delete('/referential/mappings', unsetReferentialMapping);
router.get('/referential/mappings', listReferentialMappings);
router.get('/referential/coverage', getReferentialCoverage);
router.get('/referential/skeleton', getReferentialSkeleton);

// Accounting period management (INCR-1).
// NOTE: /:unitId/periods must come before /periods/:id routes to avoid param clash.
router.get('/:unitId/periods', listPeriods);
router.post('/:unitId/periods/seed-year', seedYear);
router.post('/periods/:id/open', openPeriod);
router.post('/periods/:id/soft-close', softClosePeriod);
router.post('/periods/:id/hard-close', hardClosePeriod);
router.post('/periods/:id/reopen', reopenPeriod);

export default router;
