/**
 * @deprecated R26 — structuredData feature retired (Onda 3).
 * The backend pipeline is preserved but the frontend was never connected.
 * Do not expand until a UI is built. See features/structuredData/README.md.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { updateStructuredDataSchema } from '@/features/structuredData/dtos/StructuredDataDto';

const DocumentIdParamSchema = z.object({
  documentId: z.string().cuid({ message: 'Invalid document ID' }),
});

export async function getStructuredDataByDocument(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = DocumentIdParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const service = getFactory().getStructuredDataService();
    const structuredData = await service.getByDocumentId(ctx, parsed.data.documentId);
    return res.status(200).json({ success: true, data: structuredData });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateStructuredData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsedParams = DocumentIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ success: false, error: parsedParams.error.flatten() });
    }

    const parsedBody = updateStructuredDataSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ success: false, error: parsedBody.error.flatten() });
    }

    const service = getFactory().getStructuredDataService();
    const updated = await service.update(ctx, parsedParams.data.documentId, parsedBody.data);
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
}
