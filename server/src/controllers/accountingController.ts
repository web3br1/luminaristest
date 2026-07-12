import { Request, Response } from 'express';
import { getUserContextFromRequest } from '../lib/authUtils';
import { handleApiError } from '../lib/apiUtils';
import { UnauthorizedError, ValidationError } from '../lib/errors';
import { getFactory } from '../lib/factory';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import {
  PostEntrySchema,
  ReverseEntrySchema,
  ReportQuerySchema,
  ListAccountsQuerySchema,
  ListEntriesQuerySchema,
  CreateAccountSchema,
  DeleteAccountQuerySchema,
  SeedYearSchema,
  ClosePeriodSchema,
  ReopenPeriodSchema,
  BalanceSheetQuerySchema,
  IncomeStatementQuerySchema,
} from '../features/accounting/dtos/PostingDto';
import { CashFlowStatementQuerySchema } from '../features/accounting/dtos/cashFlowReport.dto';
import { PeriodComparisonSchema } from '../features/accounting/dtos/periodComparison.dto';
import { DailyJournalRequestSchema } from '../features/accounting/dtos/dailyJournal.dto';

export const postEntry = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = PostEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getPostingService().postEntry(scope, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const reverseEntry = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ReverseEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getPostingService().reverseEntry(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const getTrialBalance = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ReportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getAccountingReportService().trialBalance(scope);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const getAccountLedger = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ReportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const accountCode = req.query.accountCode;
    if (typeof accountCode !== 'string' || accountCode.length === 0) {
      throw new ValidationError('accountCode é obrigatório.');
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getAccountingReportService().accountLedger(scope, accountCode);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const listAccounts = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ListAccountsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const accounts = await getFactory().getPostingService().listAccounts(scope);
    return res.json({ success: true, data: { accounts } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const listEntries = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ListEntriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const result = await getFactory().getPostingService().listEntries(scope, {
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return res.json({ success: true, data: { entries: result.entries, total: result.total } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const createAccount = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = CreateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const account = await getFactory().getPostingService().createAccount(scope, parsed.data);
    return res.status(201).json({ success: true, data: { account } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const { id } = req.params;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ValidationError('id é obrigatório.');
    }
    const parsed = DeleteAccountQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    await getFactory().getPostingService().deleteAccount(scope, id);
    return res.json({ success: true });
  } catch (error) {
    return handleApiError(error, res);
  }
};

// ---------------------------------------------------------------------------
// Financial statements (INCR-4)
// ---------------------------------------------------------------------------

/** @openapi
 * /api/accounting/balance-sheet:
 *   get:
 *     summary: Balanço Patrimonial — snapshot as_of a given date
 *     parameters:
 *       - { in: query, name: unitId, required: true, schema: { type: string } }
 *       - { in: query, name: asOf,   required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — position date (as_of semantics)" }
 *     responses:
 *       200: { description: Balance sheet report }
 *       400: { description: Validation error or FROM_DATE_NOT_SUPPORTED_IN_INCR4 }
 */
export const getBalanceSheet = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    // from/to are not supported — param-accepted-and-ignored is a silent bug (ADR-INCR4 Q3).
    if (req.query.from !== undefined || req.query.to !== undefined) {
      return res
        .status(400)
        .json({ success: false, error: 'FROM_DATE_NOT_SUPPORTED_IN_INCR4' });
    }
    const parsed = BalanceSheetQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    // asOf is end-of-day UTC so the full day is included in the snapshot.
    const asOf = new Date(parsed.data.asOf + 'T23:59:59.999Z');
    const data = await getFactory().getAccountingReportService().balanceSheet(scope, asOf);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/income-statement:
 *   get:
 *     summary: DRE — year_to_date from 1 Jan of asOf.year through asOf
 *     parameters:
 *       - { in: query, name: unitId, required: true, schema: { type: string } }
 *       - { in: query, name: asOf,   required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — period end date; fromDate is computed as 1 Jan of that year" }
 *     responses:
 *       200: { description: Income statement report }
 *       400: { description: Validation error or FROM_DATE_NOT_SUPPORTED_IN_INCR4 }
 */
export const getIncomeStatement = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    if (req.query.from !== undefined || req.query.to !== undefined) {
      return res
        .status(400)
        .json({ success: false, error: 'FROM_DATE_NOT_SUPPORTED_IN_INCR4' });
    }
    const parsed = IncomeStatementQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const asOf = new Date(parsed.data.asOf + 'T23:59:59.999Z');
    const data = await getFactory().getAccountingReportService().incomeStatement(scope, asOf);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/reports/cash-flow:
 *   get:
 *     summary: DFC — Demonstração do Fluxo de Caixa (método indireto), year_to_date
 *     parameters:
 *       - { in: query, name: unitId, required: true, schema: { type: string } }
 *       - { in: query, name: asOf,   required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — inclusive upper bound; window is 1 Jan of that year → asOf" }
 *     responses:
 *       200: { description: Cash-flow statement report }
 *       400: { description: Validation error }
 */
export const getCashFlow = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = CashFlowStatementQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const asOf = new Date(parsed.data.asOf + 'T23:59:59.999Z');
    const data = await getFactory().getCashFlowReportService().cashFlowStatement(scope, asOf);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/reports/period-comparison:
 *   get:
 *     summary: Balancete comparativo / variação mensal — two as-of snapshots + delta
 *     parameters:
 *       - { in: query, name: unitId,       required: true, schema: { type: string } }
 *       - { in: query, name: asOfCurrent,  required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — current period as-of date" }
 *       - { in: query, name: asOfPrevious, required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — comparison period as-of date" }
 *     responses:
 *       200: { description: Comparative trial balance report }
 *       400: { description: Validation error }
 */
export const getPeriodComparison = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    // unitId is scope, not part of the (strict) date DTO — read it separately.
    const unitId = req.query.unitId;
    if (typeof unitId !== 'string' || unitId.length === 0) {
      throw new ValidationError('unitId é obrigatório.');
    }
    const parsed = PeriodComparisonSchema.safeParse({
      asOfCurrent: req.query.asOfCurrent,
      asOfPrevious: req.query.asOfPrevious,
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, unitId);
    const data = await getFactory()
      .getPeriodComparisonReportService()
      .comparativeTrialBalance(scope, parsed.data.asOfCurrent, parsed.data.asOfPrevious);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/reports/daily-journal:
 *   get:
 *     summary: Livro Diário — chronological journal entries over a date range (read-only)
 *     parameters:
 *       - { in: query, name: unitId, required: true, schema: { type: string } }
 *       - { in: query, name: from,   required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — inclusive lower bound" }
 *       - { in: query, name: to,     required: true, schema: { type: string, format: date }, description: "YYYY-MM-DD — inclusive upper bound" }
 *     responses:
 *       200: { description: Daily journal report }
 *       400: { description: Validation error (includes from > to) }
 */
export const getDailyJournal = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = DailyJournalRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getDailyJournalReportService()
      .dailyJournal(scope, { from: parsed.data.from, to: parsed.data.to });
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

// ---------------------------------------------------------------------------
// Accounting period management (INCR-1)
// ---------------------------------------------------------------------------

/** @openapi
 * /api/accounting/{unitId}/periods:
 *   get:
 *     summary: List accounting periods for a fiscal year
 *     parameters:
 *       - { in: path, name: unitId, required: true, schema: { type: string } }
 *       - { in: query, name: year, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: List of periods }
 */
export const listPeriods = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const unitId = req.params.unitId;
    if (!unitId) throw new ValidationError('unitId é obrigatório.');
    const year = parseInt(req.query.year as string, 10);
    if (!year || isNaN(year)) throw new ValidationError('year é obrigatório e deve ser inteiro.');
    const scope = resolveAccountingScope(user, unitId);
    const data = await getFactory().getPeriodService().listPeriods(scope, year);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/{unitId}/periods/seed-year:
 *   post:
 *     summary: Seed 12 FUTURE periods for a fiscal year
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SeedYearInput' }
 *     responses:
 *       201: { description: Periods seeded }
 */
export const seedYear = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = SeedYearSchema.safeParse({ ...req.body, unitId: req.params.unitId });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getPeriodService().seedYear(scope, parsed.data.year);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/periods/{id}/open:
 *   post:
 *     summary: Open a FUTURE or SOFT_CLOSED period
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [unitId], properties: { unitId: { type: string } } }
 *     responses:
 *       200: { description: Period opened }
 */
export const openPeriod = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const unitId = req.body?.unitId;
    if (!unitId) throw new ValidationError('unitId é obrigatório.');
    const scope = resolveAccountingScope(user, unitId);
    const data = await getFactory().getPeriodService().openPeriod(scope, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/periods/{id}/soft-close:
 *   post:
 *     summary: Soft-close an OPEN period (can be reopened)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClosePeriodInput' }
 *     responses:
 *       200: { description: Period soft-closed }
 */
export const softClosePeriod = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ClosePeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getPeriodService().softClosePeriod(scope, req.params.id, parsed.data.reason);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/periods/{id}/hard-close:
 *   post:
 *     summary: Permanently close a period (HARD_CLOSED = terminal)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClosePeriodInput' }
 *     responses:
 *       200: { description: Period hard-closed }
 */
export const hardClosePeriod = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ClosePeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getPeriodService().hardClosePeriod(scope, req.params.id, parsed.data.reason);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** @openapi
 * /api/accounting/periods/{id}/reopen:
 *   post:
 *     summary: Reopen a SOFT_CLOSED period (HARD_CLOSED cannot be reopened)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ReopenPeriodInput' }
 *     responses:
 *       200: { description: Period reopened }
 */
export const reopenPeriod = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ReopenPeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getPeriodService().reopenPeriod(scope, req.params.id, parsed.data.reason);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
