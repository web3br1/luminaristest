import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { getFactory } from '@/lib/factory';
import {
  CreateSavedTableViewSchema,
  UpdateSavedTableViewSchema,
} from '@/features/savedViews/dtos/SavedTableViewDto';

const idSchema = z.string().cuid();
const listQuerySchema = z.object({ tableId: z.string().min(1) });

export async function listSavedViews(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ success: false, error: query.error.flatten() });

    const views = await getFactory().getSavedTableViewService().list(ctx, query.data.tableId);
    return res.status(200).json({ success: true, data: views });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createSavedView(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const body = CreateSavedTableViewSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const view = await getFactory().getSavedTableViewService().create(ctx, body.data);
    return res.status(201).json({ success: true, data: view });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateSavedView(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const idParse = idSchema.safeParse(req.params.id);
    if (!idParse.success) return res.status(400).json({ success: false, error: 'Invalid saved view ID' });

    const body = UpdateSavedTableViewSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const view = await getFactory().getSavedTableViewService().update(ctx, idParse.data, body.data);
    return res.status(200).json({ success: true, data: view });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteSavedView(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const idParse = idSchema.safeParse(req.params.id);
    if (!idParse.success) return res.status(400).json({ success: false, error: 'Invalid saved view ID' });

    await getFactory().getSavedTableViewService().delete(ctx, idParse.data);
    return res.status(200).json({ success: true, data: { id: idParse.data } });
  } catch (error) {
    return handleApiError(error, res);
  }
}
