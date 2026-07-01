import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import {
  ExportRequestSchema,
  JobScopeQuerySchema,
} from '../features/accounting/dtos/DataExchangeDto';

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
