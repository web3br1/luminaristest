import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getFactory } from '@/lib/factory';
import { CreateDocumentSchema, UpdateDocumentSchema } from '@/features/documents/dtos/DocumentDto';
import { DocumentPurpose } from '@/features/documents/models/Document.model';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { qdrant } from '@/lib/vector/qdrant';
import { DocumentProcessingService } from '@/features/documents/services/DocumentProcessingService';

// ---------------------------------------------------------------------------
// Multer security configuration (R7)
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // XLSX
  'application/msword',       // legacy .doc
  'application/octet-stream', // some browsers send this for .docx/.xlsx
]);

const TOKEN_COST_MIME_TYPES = new Set([
  ...DOCUMENT_MIME_TYPES,
  'text/csv',
]);

/** Magic-bytes validation — secondary check after MIME filter. */
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
  const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK (DOCX and XLSX are ZIP-based)

  if (mimetype === 'application/pdf') {
    return PDF_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  if (
    mimetype.includes('officedocument') ||
    mimetype.includes('spreadsheet') ||
    mimetype === 'application/msword' ||
    mimetype === 'application/octet-stream'
  ) {
    return ZIP_MAGIC.every((byte, i) => buffer[i] === byte);
  }
  // CSV and other text-based types — no magic bytes to check
  return true;
}

/** Wraps a multer single-field middleware and converts multer errors to HTTP responses. */
function makeUploadMiddleware(
  allowedTypes: Set<string>,
  fieldName: string,
) {
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
            error: 'File too large. Maximum size is 50 MB.',
          });
          return;
        }
        res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
        return;
      }
      if (err instanceof Error && err.message === 'INVALID_FILE_TYPE') {
        res.status(415).json({
          success: false,
          error: 'File type not supported. Allowed types: PDF, DOCX, XLSX.',
        });
        return;
      }
      next(err);
    });
  };
}

export const uploadMiddleware = makeUploadMiddleware(DOCUMENT_MIME_TYPES, 'file');


export async function listDocuments(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const page = Math.max(1, Number(req.query.page || 1));
    const safeLimit = Math.min(Number(req.query.limit || 50) || 50, 100);
    const service = getFactory().getDocumentService();
    const data = await service.getAllDocuments(ctx as any, page, safeLimit);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function listDocumentNames(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const service = getFactory().getDocumentService();
    const data = await service.getDocumentListForUser(ctx as any);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDocumentById(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { id } = req.params;
    const service = getFactory().getDocumentService();
    const data = await service.getDocumentById(id, ctx as any);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteDocument(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { id } = req.params;
    const service = getFactory().getDocumentService();
    await service.deleteDocument(id, ctx as any);
    return res.json({ success: true });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function searchDocuments(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { query, limit } = req.body as { query: string; limit?: number };
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    const service = getFactory().getDocumentService();
    const results = await service.searchDocuments(query, ctx as any, limit ?? 10);
    return res.json({ success: true, data: results });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function uploadDocument(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required (field name: file)' });
    }

    // Secondary magic-bytes check — guards against MIME spoofing
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      return res.status(415).json({
        success: false,
        error: 'File content does not match declared type.',
      });
    }

    const bodyValidation = CreateDocumentSchema.pick({
      fileName: true,
      fileType: true,
      fileSize: true,
      documentPurpose: true,
    }).safeParse({
      fileName: file.originalname,
      fileType: (req.body?.fileType || file.originalname.split('.').pop() || '').toString().toUpperCase(),
      fileSize: file.size,
      documentPurpose: req.body?.documentPurpose || DocumentPurpose.DATA_ANALYSIS,
    });

    if (!bodyValidation.success) {
      return res.status(400).json({ success: false, error: bodyValidation.error.flatten() });
    }

    const { fileName, fileType, fileSize, documentPurpose } = bodyValidation.data;
    const service = getFactory().getDocumentService();
    const copy = new Uint8Array(file.buffer.length);
    copy.set(file.buffer);
    const arrayBuffer: ArrayBuffer = copy.buffer as ArrayBuffer;
    const created = await service.createDocument(
      arrayBuffer,
      fileName,
      fileType,
      fileSize,
      ctx as any,
      documentPurpose
    );

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateDocument(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { id } = req.params;
    const parse = UpdateDocumentSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() });

    const service = getFactory().getDocumentService();
    const updated = await service.updateDocument(id, parse.data, ctx as any);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function qdrantStatus(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const countResponse = await qdrant.api().countPoints({ collection_name: 'documents' });
    const count = (countResponse.data as any)?.result?.count || 0;

    const sampleResponse = await qdrant.api().getPoints({
      collection_name: 'documents',
      ids: [],
      with_payload: true,
      with_vector: false,
    } as any);
    const sample = (sampleResponse.data as any)?.result || [];

    return res.status(200).json({ success: true, data: { count, sample } });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDocumentQdrant(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const documentId = req.params.id;
    if (!documentId) return res.status(400).json({ success: false, error: 'Document ID is required' });

    const factory = getFactory();
    const vectorRepo = factory.getVectorRepository();
    const documentService = factory.getDocumentService();
    const document = await documentService.getDocumentById(documentId, ctx as any);
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    const points = await vectorRepo.getPointsByDocumentId(documentId);
    return res.status(200).json({ success: true, data: { points } });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export const tokenCostUpload = makeUploadMiddleware(TOKEN_COST_MIME_TYPES, 'file');
export async function computeTokenCost(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const data = file.buffer;
    let text = '';
    const mime = file.mimetype || '';
    const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (mime === 'application/pdf' || mime === excelMimeType) {
      const arrayBuffer = data.buffer.slice(0, data.byteLength) as ArrayBuffer;
      const processingService = new DocumentProcessingService();
      text = await processingService.extractText(arrayBuffer, mime);
    } else if (mime === 'text/csv') {
      text = data.toString('utf-8');
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported file type for token cost' });
    }

    const tokenCount = Math.ceil(text.length / 4);
    return res.status(200).json({ success: true, data: { tokens: tokenCount, charCount: text.length } });
  } catch (error) {
    return handleApiError(error, res);
  }
}
