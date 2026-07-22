import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { resolveChartData, resolveChartDetails } from '@/features/analytics/engine/AnalyticsResolver';
import { ChartDataQuerySchema, ChartDetailsQuerySchema, DrillDownQuerySchema } from '@/features/analytics/dtos/AnalyticsQueryDto';

export async function getAnalyticsPresets(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const presetKey = typeof req.query.presetKey === 'string' ? req.query.presetKey : undefined;
    const groups = await getFactory().getAnalyticsService().getAllPresetGroupsAsync(ctx.userId, presetKey);
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getAnalyticsData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = ChartDataQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const result = await resolveChartData(ctx, parsed.data.key, { ...req.query });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getPresetAnalyticsPresets(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const presetKey = String(req.params.presetKey || '');
    const groups = await getFactory().getAnalyticsService().getAllPresetGroupsAsync(ctx.userId, presetKey);
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getPresetAnalyticsData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = ChartDataQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const result = await resolveChartData(ctx, parsed.data.key, { ...req.query });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getChartDetails(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const chartKey = String(req.params.chartKey || '');
    const parsed = ChartDetailsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const result = await resolveChartDetails(ctx, chartKey, parsed.data.dataPointName, {
      page: parsed.data.page,
      limit: parsed.data.limit,
      search: parsed.data.search,
      sortBy: parsed.data.sortBy,
      sortOrder: parsed.data.sortOrder,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, res);
  }
}


export async function discoverTableKPIs(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const tableId = String(req.params.tableId || '');
    if (!tableId) return res.status(400).json({ success: false, error: 'Table ID is required' });

    const suggestedGroups = await getFactory().getAnalyticsService().discoverKPIsAsync(ctx.userId, tableId);
    return res.status(200).json({ success: true, data: suggestedGroups });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDrillDownData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = DrillDownQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const { tableId, recordIds: recordIdsStr, fields: fieldsStr, page, limit } = parsed.data;

    const recordIds = recordIdsStr ? recordIdsStr.split(',').map(id => id.trim()) : [];

    if (recordIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()) : [];

    const dynamicTableService = await import('@/lib/factory').then(m => m.getFactory().getDynamicTableService());
    const table = await dynamicTableService.getTableById(ctx, tableId);
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });
    
    // Instead of fetching allData and filtering, fetch directly from DB to prevent memory boom
    let filteredData = await dynamicTableService.getTableDataByIds(ctx, tableId, recordIds);

    // Optional: map to return only specific fields to save bandwidth
    if (fields.length > 0) {
      filteredData = filteredData.map((row) => {
        const slicedData: Record<string, unknown> = {};
        for (const field of fields) {
          if (row.data && (row.data as Record<string, unknown>)[field] !== undefined) {
             slicedData[field] = (row.data as Record<string, unknown>)[field];
          }
        }
        return {
          ...row,
          data: slicedData as typeof row.data,
        };
      });
    }

    // Optional Pagination (in-memory) — page/limit already validated above.
    const totalRecords = filteredData.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    
    const paginatedData = filteredData.slice(offset, offset + limit);

    return res.status(200).json({ 
      success: true, 
      schema: table.schema,
      data: paginatedData,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages
      }
    });

  } catch (error) {
    return handleApiError(error, res);
  }
}
