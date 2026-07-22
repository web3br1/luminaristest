import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { getFactory } from '@/lib/factory';
import { CreateDashboardLayoutSchema, UpdateDashboardLayoutSchema } from '@/features/dashboardLayout/dtos/DashboardLayoutDto';

const LayoutIdSchema = z.object({ id: z.string().cuid({ message: 'Invalid layout ID format' }) });

/** @openapi
 * /api/dashboard-layout:
 *   get:
 *     summary: List all dashboard widget layouts for the current user
 *     tags: [DashboardLayout]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Array of layout objects }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 */
export async function listLayouts(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const layouts = await getFactory().getDashboardLayoutService().getLayoutsByUser(ctx);
    return res.status(200).json({ success: true, data: layouts });
  } catch (error) {
    return handleApiError(error, res);
  }
}

/** @openapi
 * /api/dashboard-layout:
 *   post:
 *     summary: Save a new dashboard widget layout
 *     tags: [DashboardLayout]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, config]
 *             properties:
 *               name: { type: string, minLength: 3, maxLength: 50 }
 *               type: { type: string, enum: [GRID, LIST, CUSTOM] }
 *               config: { type: object }
 *     responses:
 *       '201': { description: Layout created }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 */
export async function createLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = CreateDashboardLayoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const newLayout = await getFactory().getDashboardLayoutService().createLayout(parsed.data, ctx);
    return res.status(201).json({ success: true, data: newLayout });
  } catch (error) {
    return handleApiError(error, res);
  }
}

/** @openapi
 * /api/dashboard-layout/{id}:
 *   get:
 *     summary: Get a dashboard layout by ID
 *     tags: [DashboardLayout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: cuid } }
 *     responses:
 *       '200': { description: Layout }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
export async function getLayoutById(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = LayoutIdSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const layout = await getFactory().getDashboardLayoutService().getLayoutById(parsed.data.id, ctx);
    return res.status(200).json({ success: true, data: layout });
  } catch (error) {
    return handleApiError(error, res);
  }
}

/** @openapi
 * /api/dashboard-layout/{id}:
 *   patch:
 *     summary: Update a dashboard layout
 *     tags: [DashboardLayout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: cuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 3, maxLength: 50 }
 *               type: { type: string, enum: [GRID, LIST, CUSTOM] }
 *               config: { type: object }
 *     responses:
 *       '200': { description: Updated layout }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
export async function updateLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const idParsed = LayoutIdSchema.safeParse(req.params);
    if (!idParsed.success) return res.status(400).json({ success: false, error: idParsed.error.flatten() });

    const bodyParsed = UpdateDashboardLayoutSchema.safeParse(req.body);
    if (!bodyParsed.success) return res.status(400).json({ success: false, error: bodyParsed.error.flatten() });

    const updated = await getFactory().getDashboardLayoutService().updateLayout(idParsed.data.id, bodyParsed.data, ctx);
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
}

/** @openapi
 * /api/dashboard-layout/{id}/activate:
 *   post:
 *     summary: Set a dashboard layout as the active one for the current user
 *     tags: [DashboardLayout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: cuid } }
 *     responses:
 *       '200': { description: Activated layout }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
export async function activateLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = LayoutIdSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const layout = await getFactory().getDashboardLayoutService().setActiveLayout(parsed.data.id, ctx);
    return res.status(200).json({ success: true, data: layout });
  } catch (error) {
    return handleApiError(error, res);
  }
}

/** @openapi
 * /api/dashboard-layout/{id}:
 *   delete:
 *     summary: Delete a dashboard layout
 *     tags: [DashboardLayout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: cuid } }
 *     responses:
 *       '200': { description: Layout deleted }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
export async function deleteLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = LayoutIdSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    await getFactory().getDashboardLayoutService().deleteLayout(parsed.data.id, ctx);
    return res.status(200).json({ success: true, message: 'Layout deleted' });
  } catch (error) {
    return handleApiError(error, res);
  }
}
