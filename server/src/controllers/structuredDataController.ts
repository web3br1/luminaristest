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

/** @openapi
 * /api/structured-data/{documentId}:
 *   get:
 *     summary: Get structured data extracted from a specific document
 *     description: Deprecated (R26) — feature retired, backend preserved without a UI.
 *     deprecated: true
 *     tags: [StructuredData]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: documentId, required: true, schema: { type: string, format: cuid } }
 *     responses:
 *       '200': { description: Extracted structured data }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
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

/** @openapi
 * /api/structured-data/{documentId}:
 *   put:
 *     summary: Update the structured data extracted from a specific document
 *     description: Deprecated (R26) — feature retired, backend preserved without a UI.
 *     deprecated: true
 *     tags: [StructuredData]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: documentId, required: true, schema: { type: string, format: cuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       '200': { description: Updated structured data }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
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
