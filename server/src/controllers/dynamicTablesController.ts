import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { z } from 'zod';
import {
  CreateDynamicTableDataDto,
  UpdateDynamicTableDataDto,
} from '@/features/dynamicTables/dtos/DynamicTable.dto';

const cuidSchema = z.string().cuid();

export async function listTables(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const service = getFactory().getDynamicTableService();
    const tables = await service.getTablesForUser(ctx.id);
    return res.json({ success: true, data: tables });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getTable(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parse = cuidSchema.safeParse(req.params.tableId);
    if (!parse.success) return res.status(400).json({ success: false, error: 'Invalid table ID' });

    const service = getFactory().getDynamicTableService();
    const table = await service.getTableById(ctx as any, req.params.tableId);
    return res.json({ success: true, data: table });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getTableData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parse = cuidSchema.safeParse(req.params.tableId);
    if (!parse.success) return res.status(400).json({ success: false, error: 'Invalid table ID' });

    const service = getFactory().getDynamicTableService();
    const data = await service.getTableData(ctx as any, req.params.tableId);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createTableData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parse = cuidSchema.safeParse(req.params.tableId);
    if (!parse.success) return res.status(400).json({ success: false, error: 'Invalid table ID' });

    const body = CreateDynamicTableDataDto.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const service = getFactory().getDynamicTableService();
    const created = await service.createTableData(ctx as any, req.params.tableId, body.data);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateTableData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const dataIdParse = cuidSchema.safeParse(req.params.dataId);
    if (!dataIdParse.success) return res.status(400).json({ success: false, error: 'Invalid data ID' });

    const body = UpdateDynamicTableDataDto.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const service = getFactory().getDynamicTableService();
    const updated = await service.updateTableData(ctx as any, req.params.dataId, body.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteTableData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const dataIdParse = cuidSchema.safeParse(req.params.dataId);
    if (!dataIdParse.success) return res.status(400).json({ success: false, error: 'Invalid data ID' });

    const service = getFactory().getDynamicTableService();
    await service.deleteTableData(ctx as any, req.params.dataId);
    return res.status(204).end();
  } catch (error) {
    return handleApiError(error, res);
  }
}

export const ResolveRelationsDto = z.object({
  lookups: z.array(z.object({
    tableId: cuidSchema,
    recordIds: z.array(z.string()),
    displayField: z.string().optional()
  }))
});

export async function resolveRelations(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const body = ResolveRelationsDto.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const service = getFactory().getDynamicTableService();
    const data = await service.resolveRelations(ctx as any, body.data.lookups);

    res.setHeader('Cache-Control', 'public, max-age=30'); // short cache given lookup nature
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}
