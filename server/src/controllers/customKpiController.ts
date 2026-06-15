/**
 * Custom KPI Controller
 *
 * POST /api/analytics/custom-kpis
 *
 * Accepts an array of KPI definitions, validates them with Zod and against
 * the target table's actual column list, then executes them safely so that
 * one broken calculation never crashes the whole dashboard.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { getFactory } from '@/lib/factory';
import {
  KpiDefinitionSchema,
  validateKpiDefinition,
  type ColumnDescriptor,
} from '@/features/analytics/schemas/KpiSchema';
import type { IDynamicTable } from '@/features/dynamicTables/models/DynamicTable.model';
import { executeCustomKpis } from '@/features/analytics/engine/CustomKpiExecutor';

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

const CustomKpiRequestSchema = z.object({
  tableId: z.string().min(1, 'tableId is required'),
  kpis: z.array(KpiDefinitionSchema).min(1, 'At least one KPI definition is required'),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/analytics/custom-kpis
 *
 * Body:
 * ```json
 * {
 *   "tableId": "<tableId>",
 *   "kpis": [
 *     {
 *       "name": "Total Revenue",
 *       "tableId": "<tableId>",
 *       "measure": "sum",
 *       "field": "totalAmount",
 *       "filters": [{ "field": "status", "operator": "eq", "value": "paid" }]
 *     }
 *   ]
 * }
 * ```
 *
 * Returns:
 * - `400` if Zod validation fails or any KPI field does not exist in the schema.
 * - `404` if the table is not found.
 * - `200` with an array of KPI results, where each failed calculation produces
 *         `{ kpiName, value: null, error: "Calculation failed" }` instead of
 *         propagating and crashing the whole response.
 */
export async function executeCustomKpisHandler(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // -------------------------------------------------------------------
    // 1. Zod parse
    // -------------------------------------------------------------------
    const parseResult = CustomKpiRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const { tableId, kpis } = parseResult.data;

    // -------------------------------------------------------------------
    // 2. Fetch table and its schema columns
    // -------------------------------------------------------------------
    const service = getFactory().getDynamicTableService();
    let table: IDynamicTable | undefined;
    try {
      table = await service.getTableById(ctx, tableId);
    } catch {
      return res.status(404).json({ success: false, error: `Table not found: ${tableId}` });
    }

    if (!table) {
      return res.status(404).json({ success: false, error: `Table not found: ${tableId}` });
    }

    const columns: ColumnDescriptor[] = (table.schema?.fields ?? []) as unknown as ColumnDescriptor[];

    // -------------------------------------------------------------------
    // 3. Per-KPI field existence validation
    // -------------------------------------------------------------------
    const fieldErrors: Array<{ kpiName: string; errors: string[] }> = [];

    for (const kpi of kpis) {
      const result = validateKpiDefinition(kpi, columns);
      if (!result.valid) {
        fieldErrors.push({ kpiName: kpi.name, errors: result.errors });
      }
    }

    if (fieldErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'One or more KPI definitions reference fields that do not exist in the table schema',
        details: fieldErrors,
      });
    }

    // -------------------------------------------------------------------
    // 4. Fetch table data
    // -------------------------------------------------------------------
    const rawRows = await service.getAllTableData(ctx, tableId);
    const rows = rawRows.map((r) => ({
      id: String(r.id),
      data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data)
        ? r.data
        : {}) as Record<string, unknown>,
    }));

    // -------------------------------------------------------------------
    // 5. Safe execution pipeline
    //    Each KPI is individually try/caught inside executeCustomKpis so
    //    one broken calculation cannot crash the entire response.
    // -------------------------------------------------------------------
    const results = executeCustomKpis(kpis, rows);

    return res.status(200).json({ success: true, data: results });
  } catch (error) {
    return handleApiError(error, res);
  }
}
