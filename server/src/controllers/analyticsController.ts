import type { Request, Response } from 'express';
import { analyticsService } from '@/features/analytics/services/AnalyticsService';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { resolveChartData, resolveChartDetails } from '@/features/analytics/engine/AnalyticsResolver';

export async function getAnalyticsPresets(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const presetKey = typeof req.query.presetKey === 'string' ? req.query.presetKey : undefined;
    const groups = await analyticsService.getAllPresetGroupsAsync(ctx.id, presetKey);
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getAnalyticsData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const key = String(req.query.key || '');
    const params = { ...req.query };
    const result = await resolveChartData(req, key, params);
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
    const groups = await analyticsService.getAllPresetGroupsAsync(ctx.id, presetKey);
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getPresetAnalyticsData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const key = String(req.query.key || '');
    const params = { ...req.query };
    const result = await resolveChartData(req, key, params);
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
    const dataPointName = typeof req.query.dataPointName === 'string' ? req.query.dataPointName : undefined;
    const page = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const sortOrder = typeof req.query.sortOrder === 'string' && ['asc', 'desc'].includes(req.query.sortOrder)
      ? req.query.sortOrder as 'asc' | 'desc'
      : 'desc';

    const result = await resolveChartDetails(req, chartKey, dataPointName, {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
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

    const suggestedGroups = await analyticsService.discoverKPIsAsync(ctx.id, tableId);
    return res.status(200).json({ success: true, data: suggestedGroups });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getDrillDownData(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const tableId = String(req.query.tableId || '');
    if (!tableId) return res.status(400).json({ success: false, error: 'Table ID is required' });

    const recordIdsStr = String(req.query.recordIds || '');
    const recordIds = recordIdsStr ? recordIdsStr.split(',').map(id => id.trim()) : [];

    if (recordIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const fieldsStr = String(req.query.fields || '');
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

    // Optional Pagination (in-memory)
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = parseInt(String(req.query.limit || '20'), 10);
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
