import type { Request, Response } from 'express';
import { handleApiError } from '@/lib/apiUtils';
import { getFactory } from '@/lib/factory';
import { getUserContextFromRequest } from '@/lib/authUtils';
import type { IDynamicTable } from '@/features/dynamicTables/models/DynamicTable.model';
import type { UserContext } from '@/lib/authUtils';

async function getCoreTableId(user: UserContext) {
  const service = getFactory().getDynamicTableService();
  const tables = await service.getTablesForUser(user.id);
  const core = tables.find((t: IDynamicTable) => t.internalName === 'analyticsDefinitions' || t.name === 'Analytics Definitions');
  return core?.id || null;
}

export async function listAnalyticsDefinitions(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const tableId = await getCoreTableId(ctx);
    if (!tableId) return res.status(200).json({ success: true, data: [] });

    const service = getFactory().getDynamicTableService();
    const rows = await service.getAllTableData(ctx, tableId);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createAnalyticsDefinition(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const tableId = await getCoreTableId(ctx);
    if (!tableId) return res.status(400).json({ success: false, error: 'CORE analyticsDefinitions table not found' });

    const service = getFactory().getDynamicTableService();
    const created = await service.createTableData(ctx, tableId, { data: req.body });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateAnalyticsDefinition(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const tableId = await getCoreTableId(ctx);
    if (!tableId) return res.status(400).json({ success: false, error: 'CORE analyticsDefinitions table not found' });

    const id = String(req.params.id || '');
    const service = getFactory().getDynamicTableService();
    const updated = await service.updateTableData(ctx, id, { data: req.body });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteAnalyticsDefinition(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const tableId = await getCoreTableId(ctx);
    if (!tableId) return res.status(400).json({ success: false, error: 'CORE analyticsDefinitions table not found' });

    const id = String(req.params.id || '');
    const service = getFactory().getDynamicTableService();
    await service.deleteTableData(ctx, id);
    return res.status(200).json({ success: true, message: 'Definition deleted' });
  } catch (error) {
    return handleApiError(error, res);
  }
}


