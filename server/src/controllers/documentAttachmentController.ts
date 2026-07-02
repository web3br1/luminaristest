import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import {
  DEFAULT_ATTACHMENT_MIME_TYPES,
  makeUploadMiddleware,
  validateMagicBytes,
} from '../lib/uploadSecurity';
import {
  UploadDocumentAttachmentSchema,
  ListDocumentAttachmentsQuerySchema,
  DocumentAttachmentScopeQuerySchema,
} from '../features/accounting/dtos/DocumentAttachmentDto';

// 50 MB default (configurable) — accounting evidence (PDFs, scans, CSVs) runs larger
// than CRM's 25 MB. Reuses the shared multer + magic-bytes guard (lib/uploadSecurity).
const MAX_ATTACHMENT_SIZE_BYTES =
  Number(process.env.MAX_ATTACHMENT_SIZE_BYTES) || 50 * 1024 * 1024;

/** Multer middleware for the single `file` field (memory storage, MIME allowlist, size cap). */
export const documentAttachmentUpload = makeUploadMiddleware(
  DEFAULT_ATTACHMENT_MIME_TYPES,
  'file',
  MAX_ATTACHMENT_SIZE_BYTES,
);

/** POST /api/accounting/attachments — upload evidence to a journal entry. */
export const createDocumentAttachment = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required (field name: file)' });
    }

    // Secondary magic-bytes check — guards against MIME spoofing.
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      return res.status(415).json({
        success: false,
        error: 'File content does not match declared type.',
      });
    }

    const parsed = UploadDocumentAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDocumentAttachmentService().upload(scope, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/journal-entries/:journalEntryId/attachments — list for an entry. */
export const listDocumentAttachments = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ListDocumentAttachmentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getDocumentAttachmentService()
      .listByTarget(scope, parsed.data.targetType, req.params.journalEntryId);

    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/attachments/:id?unitId=... — stream a download. */
export const downloadDocumentAttachment = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = DocumentAttachmentScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const { meta, absPath } = await getFactory()
      .getDocumentAttachmentService()
      .getForDownload(scope, req.params.id);

    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(meta.fileSize));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(meta.fileName)}"`,
    );

    const stream = createReadStream(absPath);
    stream.on('error', (err: unknown) => {
      if (!res.headersSent) {
        handleApiError(err, res);
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** DELETE /api/accounting/attachments/:id?unitId=... — soft-delete (binary retained). */
export const deleteDocumentAttachment = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = DocumentAttachmentScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    await getFactory().getDocumentAttachmentService().delete(scope, req.params.id);
    return res.json({ success: true, data: { ok: true } });
  } catch (error) {
    return handleApiError(error, res);
  }
};
