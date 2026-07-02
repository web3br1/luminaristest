import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import { makeUploadMiddleware } from '../lib/uploadSecurity';
import {
  ExportRequestSchema,
  JobScopeQuerySchema,
  ImportUploadSchema,
  CommitImportSchema,
} from '../features/accounting/dtos/DataExchangeDto';

// Import files are CSV/XLSX only (spreadsheet subset of the shared allowlist). 10 MB cap (D4).
const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const MAX_IMPORT_SIZE_BYTES = Number(process.env.MAX_IMPORT_SIZE_BYTES) || 10 * 1024 * 1024;

/** Multer middleware for the single `file` field (memory storage, CSV/XLSX allowlist, size cap). */
export const dataExchangeImportUpload = makeUploadMiddleware(
  SPREADSHEET_MIME_TYPES,
  'file',
  MAX_IMPORT_SIZE_BYTES,
);

/** POST /api/accounting/data-exchange/exports — render a report/template artifact. */
export const createDataExchangeExport = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ExportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDataExchangeExportService().export(scope, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/data-exchange/jobs/:jobId?unitId=... — job summary. */
export const getDataExchangeJob = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = JobScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDataExchangeExportService().getJob(scope, req.params.jobId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/data-exchange/imports — upload + validate a CSV/XLSX file. */
export const createDataExchangeImport = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required (field name: file)' });
    }

    const parsed = ImportUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getDataExchangeImportService()
      .uploadAndValidate(scope, parsed.data.kind, {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
      });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/data-exchange/jobs/:jobId/rows?unitId=...&status=INVALID — preview/errors. */
export const listDataExchangeRows = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = JobScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getDataExchangeImportService()
      .listRows(scope, req.params.jobId, status ? { status } : undefined);

    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/data-exchange/jobs/:jobId/commit — commit VALID rows via posting services. */
export const commitDataExchangeImport = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = CommitImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDataExchangeImportService().commit(scope, req.params.jobId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/data-exchange/jobs/:jobId/download?unitId=... — stream the artifact. */
export const downloadDataExchangeArtifact = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = JobScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const { absPath, fileName, mimeType } = await getFactory()
      .getDataExchangeExportService()
      .getArtifactForDownload(scope, req.params.jobId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    const stream = createReadStream(absPath);
    stream.on('error', (err: unknown) => {
      if (!res.headersSent) handleApiError(err, res);
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    return handleApiError(error, res);
  }
};
