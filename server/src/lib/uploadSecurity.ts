import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';

/**
 * Shared multipart upload security (extracted from attachmentsController so accounting
 * and CRM reuse ONE copy of the magic-bytes guard + multer error mapping — a duplicated
 * security guard would be a §0 "island"). Behavior is byte-for-byte what CRM shipped;
 * only the size limit and MIME set are parameterized.
 */

/** Default document MIME allowlist (PDF, images, office, csv/plain, + browser octet-stream). */
export const DEFAULT_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // XLSX
  'text/csv',
  'text/plain',
  'application/octet-stream', // some browsers send this for office/binary files
]);

/** Magic-bytes validation — secondary check after the MIME allowlist (anti-spoofing). */
export function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
  const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK (DOCX and XLSX are ZIP-based)
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // \x89PNG
  const JPEG_MAGIC = [0xff, 0xd8, 0xff]; // JPEG SOI + marker

  if (mimetype === 'application/pdf') {
    return PDF_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  if (mimetype === 'image/png') {
    return PNG_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  if (mimetype === 'image/jpeg') {
    return JPEG_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  if (mimetype.includes('officedocument') || mimetype.includes('spreadsheet')) {
    return ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  // application/octet-stream is a blanket fallback some browsers send for office/PDF
  // binaries. Don't blindly trust it: require a known binary signature (ZIP/office or
  // PDF), otherwise reject — this prevents arbitrary content riding in as octet-stream.
  if (mimetype === 'application/octet-stream') {
    const isZip = ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
    const isPdf = PDF_MAGIC.every((byte, i) => buffer[i] === byte);
    return isZip || isPdf;
  }
  // Text (csv/plain) — no reliable magic-bytes signature to enforce here;
  // the MIME allowlist + size limit guard these.
  return true;
}

/** Wraps a multer single-field middleware and converts multer errors to HTTP responses. */
export function makeUploadMiddleware(
  allowedTypes: Set<string>,
  fieldName: string,
  maxFileSizeBytes: number,
  // When true, validate the uploaded file's magic bytes against its declared MIME after
  // multer buffers it (anti content-type spoofing). Import routes that don't run their own
  // magic-bytes check pass true; attachment controllers keep their in-handler check.
  // (SEC audit 2026-07-15)
  enforceMagicBytes = false,
) {
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileSizeBytes,
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
  const maxMb = Math.round(maxFileSizeBytes / (1024 * 1024));

  return (req: Request, res: Response, next: NextFunction): void => {
    single(req, res, (err: unknown) => {
      if (!err) {
        if (enforceMagicBytes) {
          const f = (req as Request & { file?: Express.Multer.File }).file;
          // Only enforce the signature when the DECLARED type is binary (XLSX/office/PDF):
          // require it to really be a ZIP/PDF. Text-ish imports (CSV/OFX/CNAB, incl. the
          // application/octet-stream some browsers send for them) have no reliable magic
          // and are validated structurally by the parser — enforcing here would falsely
          // reject legit bank statements. (SEC audit 2026-07-15)
          const declaredBinary =
            !!f &&
            (f.mimetype.includes('officedocument') ||
              f.mimetype.includes('spreadsheet') ||
              f.mimetype === 'application/pdf');
          if (declaredBinary && f.buffer && !validateMagicBytes(f.buffer, f.mimetype)) {
            res.status(415).json({
              success: false,
              error: 'File content does not match its declared type.',
            });
            return;
          }
        }
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            error: `File too large. Maximum size is ${maxMb} MB.`,
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
