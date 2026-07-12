import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import { makeUploadMiddleware } from '../lib/uploadSecurity';
import {
  ImportReferentialCatalogSchema,
  ReferentialCatalogQuerySchema,
} from '../features/accounting/dtos/ReferentialCatalogDto';

// Catalog files are CSV/XLSX only (same spreadsheet subset as the data-exchange import). 10 MB cap.
const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const MAX_CATALOG_SIZE_BYTES = Number(process.env.MAX_IMPORT_SIZE_BYTES) || 10 * 1024 * 1024;

/** Multer middleware for the single `file` field (memory storage, CSV/XLSX allowlist, size cap). */
export const referentialCatalogUpload = makeUploadMiddleware(
  SPREADSHEET_MIME_TYPES,
  'file',
  MAX_CATALOG_SIZE_BYTES,
);

/** POST /api/accounting/referential/catalog/import — import the official RFB layout for a version. */
export const importReferentialCatalog = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required (field name: file)' });
    }

    const parsed = ImportReferentialCatalogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReferentialCatalogService()
      .import(scope, parsed.data.layoutVersion, {
        originalname: file.originalname,
        buffer: file.buffer,
      });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/referential/catalog?unitId&version&q&analyticOnly — lookup/picker. */
export const listReferentialCatalog = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ReferentialCatalogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReferentialCatalogService()
      .lookup(scope, parsed.data.version, {
        q: parsed.data.q,
        analyticOnly: parsed.data.analyticOnly,
      });
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
