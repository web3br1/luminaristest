/**
 * @deprecated R26 — structuredData feature retired (Onda 3).
 * The backend pipeline is preserved but the frontend was never connected.
 * Do not expand until a UI is built. See features/structuredData/README.md.
 */
import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';

export async function getStructuredDataByDocument(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const documentId = req.params.documentId;
    if (!documentId) return res.status(400).json({ success: false, error: 'Document ID is required' });

    const service = getFactory().getStructuredDataService();
    const structuredData = await service.getByDocumentId(ctx as any, documentId);
    return res.status(200).json({ success: true, data: structuredData });
  } catch (error) {
    return handleApiError(error, res);
  }
}


