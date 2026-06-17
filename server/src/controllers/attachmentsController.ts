import type { Request, Response, NextFunction } from 'express';
import { createReadStream } from 'node:fs';
import multer from 'multer';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { CreateAttachmentSchema } from '../features/attachments/dtos/AttachmentDto';

// ---------------------------------------------------------------------------
// Multer security configuration (mirrors documentsController.makeUploadMiddleware)
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // XLSX
  'text/csv',
  'text/plain',
  'application/octet-stream', // some browsers send this for office/binary files
]);

/** Magic-bytes validation — secondary check after the MIME allowlist. */
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
  const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK (DOCX and XLSX are ZIP-based)

  if (mimetype === 'application/pdf') {
    return PDF_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  if (
    mimetype.includes('officedocument') ||
    mimetype.includes('spreadsheet')
  ) {
    return ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  // application/octet-stream is a blanket fallback some browsers send for office/PDF
  // binaries. Don't blindly trust it: require a known binary signature (ZIP/office or
  // PDF), otherwise reject — this prevents arbitrary content from riding in as octet-stream.
  if (mimetype === 'application/octet-stream') {
    const isZip = ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
    const isPdf = PDF_MAGIC.every((byte, i) => buffer[i] === byte);
    return isZip || isPdf;
  }
  // Images and text (csv/plain) — no reliable magic-bytes signature to enforce here;
  // the MIME allowlist + size limit guard these.
  return true;
}

/** Wraps a multer single-field middleware and converts multer errors to HTTP responses. */
function makeUploadMiddleware(allowedTypes: Set<string>, fieldName: string) {
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
      fields: 10,
    },
    fileFilter: (_req, file, cb) => {
      if (allowedTypes.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('INVALID_FILE_TYPE'));
      }
    },
  });

  const single = instance.single(fieldName);

  return (req: Request, res: Response, next: NextFunction): void => {
    single(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            error: 'File too large. Maximum size is 25 MB.',
          });
          return;
        }
        res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
        return;
      }
      if (err instanceof Error && err.message === 'INVALID_FILE_TYPE') {
        res.status(415).json({
          success: false,
          error: 'File type not supported. Allowed: PDF, PNG, JPEG, DOCX, XLSX, CSV, TXT.',
        });
        return;
      }
      next(err);
    });
  };
}

export const uploadMiddleware = makeUploadMiddleware(ATTACHMENT_MIME_TYPES, 'file');

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
