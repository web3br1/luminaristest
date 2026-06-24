import { Request, Response } from 'express';
import { getUserContextFromRequest } from '../lib/authUtils';
import { handleApiError } from '../lib/apiUtils';
import { UnauthorizedError, ValidationError } from '../lib/errors';
import { getFactory } from '../lib/factory';
import {
  PostEntrySchema,
  ReverseEntrySchema,
  ReportQuerySchema,
  ListAccountsQuerySchema,
  ListEntriesQuerySchema,
  CreateAccountSchema,
} from '../features/accounting/dtos/PostingDto';

export const postEntry = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = PostEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getPostingService().postEntry(user, parsed.data);
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
    const data = await getFactory().getPostingService().reverseEntry(user, parsed.data);
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
    const data = await getFactory().getAccountingReportService().trialBalance(user, parsed.data);
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
    const data = await getFactory()
      .getAccountingReportService()
      .accountLedger(user, parsed.data, accountCode);
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
    const accounts = await getFactory().getPostingService().listAccounts(user, parsed.data.unitId);
    return res.json({ accounts });
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
    const result = await getFactory().getPostingService().listEntries(user, parsed.data);
    return res.json({ entries: result.entries, total: result.total });
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
    const account = await getFactory().getPostingService().createAccount(user, parsed.data);
    return res.status(201).json({ account });
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
    await getFactory().getPostingService().deleteAccount(user, id);
    return res.json({ success: true });
  } catch (error) {
    return handleApiError(error, res);
  }
};
