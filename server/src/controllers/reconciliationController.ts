import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import { makeUploadMiddleware } from '../lib/uploadSecurity';
import type { SpreadsheetFormat } from '../lib/spreadsheet';
import {
  ImportBankStatementSchema,
  ManualMatchSchema,
  UnmatchSchema,
  SetLineIgnoredSchema,
  ListStatementsQuerySchema,
  ListLinesQuerySchema,
  ReconciliationScopeQuerySchema,
  PendingReportQuerySchema,
  AutoMatchStatementSchema,
} from '../features/accounting/dtos/ReconciliationDto';

// Statement files are CSV/XLSX only — same allowlist + cap as the data-exchange import.
const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const MAX_IMPORT_SIZE_BYTES = Number(process.env.MAX_IMPORT_SIZE_BYTES) || 10 * 1024 * 1024;

/** Multer middleware for the single `file` field (memory storage, CSV/XLSX allowlist, size cap). */
export const bankStatementUpload = makeUploadMiddleware(
  SPREADSHEET_MIME_TYPES,
  'file',
  MAX_IMPORT_SIZE_BYTES,
);

/** XLSX files are ZIP-based (PK magic); everything else is treated as CSV/text. */
function sniffFormat(buffer: Buffer, name: string): SpreadsheetFormat {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';
  if (name.toLowerCase().endsWith('.xlsx')) return 'xlsx';
  return 'csv';
}

/** POST /api/accounting/reconciliation/statements — multipart import of a bank statement. */
export const importBankStatement = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required (field name: file)' });
    }
    const parsed = ImportBankStatementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReconciliationService()
      .importStatement(scope, parsed.data, {
        buffer: file.buffer,
        format: sniffFormat(file.buffer, file.originalname),
      });
    return res.status(data.created ? 201 : 200).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/reconciliation/statements?unitId&page&limit — paginated list. */
export const listBankStatements = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ListStatementsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReconciliationService()
      .listStatements(scope, parsed.data.page, parsed.data.limit);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/reconciliation/statements/:id/lines?unitId&status — statement lines. */
export const listBankStatementLines = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ListLinesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReconciliationService()
      .listLines(scope, req.params.id, parsed.data.status);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** DELETE /api/accounting/reconciliation/statements/:id?unitId — soft-delete (blocked by active matches). */
export const deleteBankStatement = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ReconciliationScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    await getFactory().getReconciliationService().deleteStatement(scope, req.params.id);
    return res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/reconciliation/statements/:id/auto-match — deterministic run (D6). */
export const autoMatchBankStatement = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = AutoMatchStatementSchema.safeParse({
      unitId: (req.body as { unitId?: unknown })?.unitId,
      statementId: req.params.id,
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReconciliationService()
      .autoMatchStatement(scope, parsed.data.statementId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/reconciliation/lines/:id/suggestions?unitId — ranked candidates. */
export const getLineSuggestions = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ReconciliationScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getReconciliationService().suggestions(scope, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/reconciliation/matches — manual match (N postings ↔ 1 line, D3). */
export const createManualMatch = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ManualMatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getReconciliationService().manualMatch(scope, {
      statementLineId: parsed.data.statementLineId,
      postingIds: parsed.data.postingIds,
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/reconciliation/matches/:id/unmatch — soft-undo (D7). */
export const unmatchReconciliation = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const body = req.body as { unitId?: unknown; reason?: unknown } | undefined;
    const parsed = UnmatchSchema.safeParse({
      unitId: body?.unitId,
      matchId: req.params.id,
      ...(body?.reason !== undefined ? { reason: body.reason } : {}),
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    await getFactory().getReconciliationService().unmatch(scope, {
      matchId: parsed.data.matchId,
      reason: parsed.data.reason,
    });
    return res.json({ success: true, data: { id: parsed.data.matchId } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/reconciliation/lines/:id/ignore — mark/unmark IGNORED. */
export const setLineIgnored = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const body = req.body as { unitId?: unknown; ignored?: unknown } | undefined;
    const parsed = SetLineIgnoredSchema.safeParse({
      unitId: body?.unitId,
      statementLineId: req.params.id,
      ignored: body?.ignored,
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    await getFactory().getReconciliationService().setLineIgnored(scope, {
      statementLineId: parsed.data.statementLineId,
      ignored: parsed.data.ignored,
    });
    return res.json({ success: true, data: { id: parsed.data.statementLineId } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/reconciliation/pending?unitId&glAccountId&from&to — pending report (§4.5). */
export const getPendingReport = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = PendingReportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getReconciliationService().pendingReport(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
