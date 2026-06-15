import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { UnauthorizedError, ValidationError } from '@/lib/errors';
import { getFactory } from '@/lib/factory';
import { CreateDashboardLayoutSchema, UpdateDashboardLayoutSchema } from '@/features/dashboardLayout/dtos/DashboardLayoutDto';

const QueryParamsSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
});

const LayoutIdSchema = z.object({ id: z.string().cuid({ message: 'Invalid layout ID format' }) });

export async function listLayouts(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    QueryParamsSchema.parse(req.query);
    const layouts = await getFactory().getDashboardLayoutService().getLayoutsByUser(ctx);
    return res.status(200).json({ success: true, data: { layouts } });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const validated = CreateDashboardLayoutSchema.parse(req.body);
    const newLayout = await getFactory().getDashboardLayoutService().createLayout(validated, ctx);
    return res.status(201).json({ success: true, data: newLayout });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getLayoutById(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { id } = LayoutIdSchema.parse(req.params);
    const layout = await getFactory().getDashboardLayoutService().getLayoutById(id, ctx);
    return res.status(200).json({ success: true, data: layout });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { id } = LayoutIdSchema.parse(req.params);
    const validationResult = UpdateDashboardLayoutSchema.safeParse(req.body);
    if (!validationResult.success) throw validationResult.error;

    const updateData = validationResult.data;
    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No update data provided for PUT/PATCH', {
        body: ['Request body must not be empty for update'],
      });
    }

    const updated = await getFactory().getDashboardLayoutService().updateLayout(id, updateData, ctx);
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteLayout(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { id } = LayoutIdSchema.parse(req.params);
    await getFactory().getDashboardLayoutService().deleteLayout(id, ctx);
    return res.status(200).json({ success: true, message: 'Layout deleted' });
  } catch (error) {
    return handleApiError(error, res);
  }
}


