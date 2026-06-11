import type { Request, Response } from 'express';
import multer from 'multer';
import { getFactory } from '@/lib/factory';
import { CreateDocumentSchema, UpdateDocumentSchema } from '@/features/documents/dtos/DocumentDto';
import { DocumentPurpose } from '@/features/documents/models/Document.model';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { qdrant } from '@/lib/vector/qdrant';
import { DocumentProcessingService } from '@/features/documents/services/DocumentProcessingService';

const upload = multer({ storage: multer.memoryStorage() });
export const uploadMiddleware = upload.single('file');


export async function listDocuments(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const service = getFactory().getDocumentService();
    const data = await service.getAllDocuments(ctx as any, page, limit);
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

export const tokenCostUpload = upload.single('file');
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
