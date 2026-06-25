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
} from '../features/accounting/dtos/PostingDto';

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
