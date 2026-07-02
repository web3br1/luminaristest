import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { CreateAttachmentSchema } from '../features/attachments/dtos/AttachmentDto';
import {
  DEFAULT_ATTACHMENT_MIME_TYPES,
  makeUploadMiddleware,
  validateMagicBytes,
} from '../lib/uploadSecurity';

// Multer + magic-bytes security is shared via lib/uploadSecurity (one copy for CRM +
// accounting). CRM keeps its 25 MB cap and the single `file` field.
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const uploadMiddleware = makeUploadMiddleware(
  DEFAULT_ATTACHMENT_MIME_TYPES,
  'file',
  MAX_FILE_SIZE,
);

export async function createAttachment(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

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

    const parsed = CreateAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const data = await getFactory().getAttachmentService().upload(ctx, {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function listAttachments(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = CreateAttachmentSchema.safeParse({
      entityType: req.query.entityType,
      entityId: req.query.entityId,
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const data = await getFactory()
      .getAttachmentService()
      .listByEntity(ctx, parsed.data.entityType, parsed.data.entityId);

    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function downloadAttachment(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { id } = req.params;
    const { meta, absPath } = await getFactory().getAttachmentService().getForDownload(ctx, id);

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
}

export async function deleteAttachment(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { id } = req.params;
    await getFactory().getAttachmentService().delete(ctx, id);
    return res.json({ success: true, data: { ok: true } });
  } catch (error) {
    return handleApiError(error, res);
  }
}
