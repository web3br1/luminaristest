import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { ForbiddenError } from '@/lib/errors';
import { Role } from '@/features/users/models/User.model';
import { z } from 'zod';
import {
  CreateDynamicTableDataDto,
  UpdateDynamicTableDataDto,
} from '@/features/dynamicTables/dtos/DynamicTable.dto';

const cuidSchema = z.string().cuid();

/** Body schema for POST /api/dynamic-tables/sync-preset (admin-only, schema-mutating). */
export const SyncPresetDto = z.object({
  internalName: z.string().trim().min(1, { message: 'internalName é obrigatório.' }),
});

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
    const table = await service.getTableById(ctx, req.params.tableId);
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

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50), 200);

    const service = getFactory().getDynamicTableService();
    const result = await service.getTableData(ctx, req.params.tableId, page, limit);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages });
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
    const created = await service.createTableData(ctx, req.params.tableId, body.data);
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
    const updated = await service.updateTableData(ctx, req.params.dataId, body.data);
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
    await service.deleteTableData(ctx, req.params.dataId);
    return res.status(204).end();
  } catch (error) {
    return handleApiError(error, res);
  }
}

/**
 * POST /api/dynamic-tables/sync-preset — additively evolve an installed table's schema
 * from its preset module. ADMIN-ONLY: this mutates installed table schemas, so it is
 * guarded by an explicit role check (ForbiddenError otherwise) on top of route auth.
 */
export async function syncPreset(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Admin-only: schema-mutating operation.
    if (ctx.role !== Role.ADMIN) {
      throw new ForbiddenError('Apenas administradores podem sincronizar schemas de preset.');
    }

    const body = SyncPresetDto.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const service = getFactory().getPresetSyncService();
    const result = await service.syncInstalledTableFromPreset(ctx, body.data.internalName);
    return res.json({ success: true, data: result });
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
    const data = await service.resolveRelations(ctx, body.data.lookups);

    res.setHeader('Cache-Control', 'public, max-age=30'); // short cache given lookup nature
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
}
