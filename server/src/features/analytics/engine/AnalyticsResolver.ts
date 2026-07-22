/**
 * Analytics Resolver
 *
 * Resolves chart data by executing processors with table data.
 */

import { logger } from '@/lib/logger';
import { analyticsService } from '../services/AnalyticsService';
import type { AnalyticsPresetGroup, ChartPreset } from '../core/models/ChartPreset';
import { getFactory } from '@/lib/factory';
import { getProcessor, type TableDataRow, type ChartDataPoint } from '../core';
import type { UserContext } from '@/types/UserContext';
import type { IDynamicTable, ITableSchema, ISchemaField, IFieldRelation } from '@/features/dynamicTables/models/DynamicTable.model';
import type { DynamicTableService } from '@/features/dynamicTables/services/DynamicTableService';

// Import to register all processors and templates
import '../dynamic';
import '../kpis';

export type ChartDataSeries = { name: string; value: number }[];

/**
 * Resolves preset table keys (e.g., '@@PRESET_TABLE_KEY::sales') to actual table IDs.
 */
async function resolveTableId(
  user: UserContext,
  presetTableKey: string,
  allTables: IDynamicTable[]
): Promise<string | null> {
  if (!presetTableKey.startsWith('@@PRESET_TABLE_KEY::')) {
    return presetTableKey;
  }

  const key = presetTableKey.replace('@@PRESET_TABLE_KEY::', '');
  const normalize = (s: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const table = allTables.find((t) => {
    if (t.internalName === key) return true;
    const kn = normalize(key);
    const nameMatch = normalize(t.name) === kn;
    const internalMatch = normalize(t.internalName || '') === kn;
    return nameMatch || internalMatch;
  });

  return table?.id || null;
}

/**
 * Resolve relation fields (IDs) to display names with Smart Fallback
 */
async function resolveRelationFields(
  records: TableDataRow[],
  schema: ITableSchema,
  service: DynamicTableService,
  user: UserContext,
  allTables: IDynamicTable[]
): Promise<TableDataRow[]> {
  if (!schema || !schema.fields || records.length === 0) return records;
  
  const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isCuidOrUuid = (val: unknown) =>
    typeof val === 'string' && (val.length >= 20 || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  // Identify relation fields
  const relationFields = schema.fields.filter((f: ISchemaField) => f.type === 'relation');
  
  // Smart Fallback: Detect fields ending in 'Id' that look like IDs but aren't relations
  const sampleData = records.slice(0, 5);
  const potentialIds = new Set<string>();
  sampleData.forEach(r => {
    Object.entries(r.data).forEach(([k, v]) => {
      if (k.endsWith('Id') && isCuidOrUuid(v) && !relationFields.find((rf) => rf.name === k)) {
        potentialIds.add(k);
      }
    });
  });

  // Add implicit relations to processing
  for (const pid of potentialIds) {
    const targetTableKey = pid.slice(0, -2); // customerId -> customer
    relationFields.push({
      name: pid,
      label: pid,
      type: 'relation',
      required: false,
      relation: { targetTable: `@@PRESET_TABLE_KEY::${targetTableKey}` }
    } as ISchemaField);
  }

  if (relationFields.length === 0) return records;

  const relationMaps: Record<string, Map<string, string>> = {};

  for (const field of relationFields) {
    const targetTableRef = field.relation?.targetTable;
    if (!targetTableRef) continue;

    const displayField = (field.relation as IFieldRelation & { displayField?: string }).displayField || 'name';
    
    // Resolve targetTable to tableId
    let targetTableId = await resolveTableId(user, targetTableRef, allTables);
    
    // Extreme fallback: if @@PRESET_TABLE_KEY::customer failed, try to just search for a table named 'customer' or similar
    if (!targetTableId && targetTableRef.startsWith('@@PRESET_TABLE_KEY::')) {
      const rawKey = normalize(targetTableRef.replace('@@PRESET_TABLE_KEY::', ''));
      const fallbackTable = allTables.find(t => normalize(t.name).includes(rawKey) || normalize(t.internalName || '').includes(rawKey));
      targetTableId = fallbackTable?.id || null;
    }
    
    if (!targetTableId) continue;
    
    try {
      const relatedRows = await service.getAllTableData(user, targetTableId);
      const lookup = new Map<string, string>();
      
      for (const relRow of relatedRows) {
        const id = String(relRow.id);
        // Priority: displayField from metadata -> name -> title -> description -> first string field -> ID
        const data = (relRow.data && typeof relRow.data === 'object' && !Array.isArray(relRow.data)
          ? relRow.data
          : {}) as Record<string, unknown>;
        const displayValue = data[displayField] ?? data['name'] ?? data['title'] ?? data['label'] ?? data['description'] ?? id;
        lookup.set(id, String(displayValue));
      }
      
      relationMaps[field.name] = lookup;
    } catch (err) {
      logger.warn('Failed to resolve relation field', { field: field.name, targetTableId, error: err });
    }
  }
  
  // Apply resolution to records
  return records.map(record => {
    const resolvedData = { ...record.data };
    
    for (const [fieldName, lookup] of Object.entries(relationMaps)) {
      const relationId = record.data?.[fieldName];
      if (relationId && lookup.has(String(relationId))) {
        // Create resolved field (ex: productId -> productName)
        const resolvedFieldName = fieldName.replace(/Id$/, 'Name') || `${fieldName}Name`;
        resolvedData[resolvedFieldName] = lookup.get(String(relationId));
        // Remove the ID field to avoid displaying it
        delete resolvedData[fieldName];
      }
    }
    
    return {
      ...record,
      data: resolvedData,
    };
  });
}

/**
 * Estima o tamanho aproximado de um array de registros em bytes
 */
function estimateRecordsSize(records: TableDataRow[]): number {
  // Estimativa: ~2-5KB por registro (JSON serializado)
  const avgRecordSize = 3500; // 3.5KB médio
  return records.length * avgRecordSize;
}

/**
 * Determina se deve incluir dados completos baseado em threshold
 */
function shouldIncludeFullData(records: TableDataRow[]): boolean {
  const MAX_RECORDS = 200;
  const MAX_SIZE_KB = 500 * 1024; // 500KB
  
  if (records.length > MAX_RECORDS) return false;
  if (estimateRecordsSize(records) > MAX_SIZE_KB) return false;
  return true;
}

/**
 * Busca registros completos para um ChartDataPoint
 */
async function fetchRecordsForDataPoint(
  dataPoint: ChartDataPoint,
  mainTable: IDynamicTable,
  service: DynamicTableService,
  user: UserContext,
  allTables: IDynamicTable[]
): Promise<TableDataRow[]> {
  const recordIds = dataPoint.recordIds || [];
  if (recordIds.length === 0) return [];
  
  const tableSource = dataPoint.tableSource || mainTable.presetKey || mainTable.internalName || 'sales';
  const allRecords: TableDataRow[] = [];
  
  // Resolver tabelas (similar ao resolveChartDetails)
  const tablesToFetch: Array<{ key: string; tableId: string; name: string }> = [];
  
  if (tableSource === 'mixed') {
    // Para mixed, identificar todas as tabelas relacionadas
    // Por enquanto, usar apenas a tabela principal
    // mainTable já tem o ID resolvido, usar diretamente
    if (mainTable.id) {
      tablesToFetch.push({
        key: mainTable.presetKey || mainTable.internalName || 'sales',
        tableId: mainTable.id,
        name: mainTable.name || 'Vendas',
      });
    }
  } else if (tableSource === '@@TABLE_SELF@@') {
    // @@TABLE_SELF@@ significa usar a tabela principal do contexto
    if (mainTable.id) {
      tablesToFetch.push({
        key: mainTable.presetKey || mainTable.internalName || 'sales',
        tableId: mainTable.id,
        name: mainTable.name || 'Vendas',
      });
    }
  } else {
    // Single table source - resolve it
    let tableSourceToResolve = tableSource;
    if (!tableSource.startsWith('@@PRESET_TABLE_KEY::') && !tableSource.startsWith('@@')) {
      tableSourceToResolve = `@@PRESET_TABLE_KEY::${tableSource}`;
    }

    const resolvedTableId = await resolveTableId(user, tableSourceToResolve, allTables);
    if (resolvedTableId) {
      try {
        const resolvedTable = await service.getTableById(user, resolvedTableId);
        if (resolvedTable) {
          tablesToFetch.push({
            key: resolvedTable.presetKey || resolvedTable.internalName || tableSource,
            tableId: resolvedTableId,
            name: resolvedTable.name || tableSource,
          });
        }
      } catch (err) {
        // Se não conseguir buscar a tabela resolvida, usar fallback para tabela principal
        logger.warn('Failed to fetch resolved table, using main table', { resolvedTableId, tableSource, error: err });
      }
    }
  }

  // Se não encontrou tabelas, usar a tabela principal
  if (tablesToFetch.length === 0) {
    tablesToFetch.push({
      key: mainTable.presetKey || mainTable.internalName || 'sales',
      tableId: mainTable.id,
      name: mainTable.name || 'Vendas',
    });
  }
  
  // Buscar registros de cada tabela
  for (const tableInfo of tablesToFetch) {
    try {
      const table = await service.getTableById(user, tableInfo.tableId);
      const tableRows = await service.getAllTableData(user, tableInfo.tableId);
      
      const matchingRecords: TableDataRow[] = [];
      for (const row of tableRows) {
        if (recordIds.includes(row.id)) {
          // Ensure data is a Record<string, any>
          const rowData = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
            ? (row.data as Record<string, unknown>)
            : {};
          matchingRecords.push({
            id: row.id,
            data: rowData,
          });
        }
      }
      
      // Resolve relation fields if schema is available
      if (table && table.schema && matchingRecords.length > 0) {
        try {
          const resolved = await resolveRelationFields(
            matchingRecords,
            table.schema,
            service,
            user,
            allTables
          );
          allRecords.push(...resolved);
        } catch (err) {
          logger.warn('Failed to resolve relations for table', { table: tableInfo.name, error: err });
          // Continue with unresolved records
          allRecords.push(...matchingRecords);
        }
      } else {
        allRecords.push(...matchingRecords);
      }
    } catch (err) {
      // Se não conseguir buscar dados da tabela, logar erro mas continuar
      logger.warn('Failed to fetch data from table', { tableId: tableInfo.tableId, table: tableInfo.name, error: err });
    }
  }
  
  return allRecords;
}

export async function resolveChartData(
  user: UserContext,
  chartKey: string,
  params: Record<string, unknown> = {}
) {
  const allGroups: AnalyticsPresetGroup[] = await analyticsService.getAllPresetGroupsAsync(user.userId);
  const chart = allGroups.flatMap((g) => g.charts).find((c) => c.key === chartKey);

  if (!chart) {
    return { chart: null, data: [], error: `Chart preset '${chartKey}' not found` };
  }

  const processor = getProcessor(chart.processor);
  if (!processor) {
    return { chart, data: [], error: `Processor '${chart.processor}' not found` };
  }

  const service = getFactory().getDynamicTableService();
  const allTables = await service.getTablesForUser(user.id);
  const tableIdParam = (chart.params?.tableId as string | undefined) || (params.tableId as string | undefined);

  if (!tableIdParam) {
    return { chart, data: [], error: 'Missing required param: tableId' };
  }

  const tableId = await resolveTableId(user, tableIdParam, allTables);
  if (!tableId) {
    return { chart, data: [], error: `Table not found for key: ${tableIdParam}` };
  }

  const table = await service.getTableById(user, tableId);
  const rows = await service.getAllTableData(user, tableId);

  // Validate field mappings
  const hasFieldMappings =
    chart.params &&
    Object.keys(chart.params).some((key) =>
      ['statusField', 'amountField', 'dateField', 'paymentStatusField'].includes(key)
    );

  if (hasFieldMappings) {
    for (const [paramKey, fieldName] of Object.entries(chart.params || {})) {
      if (['statusField', 'amountField', 'dateField', 'paymentStatusField'].includes(paramKey)) {
        const fieldExists = table.schema.fields.some((f: ISchemaField) => f.name === fieldName);
        if (!fieldExists && typeof fieldName === 'string') {
          return {
            chart,
            data: [],
            error: `Field '${fieldName}' (mapped to '${paramKey}') does not exist in table schema`,
          };
        }
      }
    }
  }

  const processorParams = {
    ...chart.params,
    ...params,
    tableId,
    timeZone: user.timeZone || 'UTC',
  };

  try {
    // Create an async generator for optimized stream reading
    async function* getTableStream() {
      for await (const batch of service.getTableDataStream(user, tableId as string)) {
        yield batch.map((r) => ({
          id: r.id,
          data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>,
        })) as TableDataRow[];
      }
    }

    const data = await processor({
      table,
      schema: table.schema,
      rows: rows.map((r) => ({
        id: r.id,
        data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>,
      })) as TableDataRow[],
      streamRows: getTableStream,
      params: processorParams,
      fetchByPresetTableKey: async (presetTableKey: string) => {
        // Ensure preset key has the proper prefix for resolution
        let keyToResolve = presetTableKey;
        if (!keyToResolve.startsWith('@@PRESET_TABLE_KEY::') && !keyToResolve.startsWith('@@')) {
          keyToResolve = `@@PRESET_TABLE_KEY::${keyToResolve}`;
        }

        const otherTableId = await resolveTableId(user, keyToResolve, allTables);
        if (!otherTableId) {
          throw new Error(`Table not found for key: ${presetTableKey}`);
        }
        const other = await service.getTableById(user, otherTableId);
        const otherRowsRaw = await service.getAllTableData(user, otherTableId);
        return {
          table: other,
          schema: other.schema,
          rows: otherRowsRaw.map((r) => ({ id: r.id, data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown> })) as TableDataRow[],
        };
      },
      fetchByTableId: async (tid: string) => {
        const other = await service.getTableById(user, tid);
        const otherRowsRaw = await service.getAllTableData(user, tid);
        return {
          table: other,
          schema: other.schema,
          rows: otherRowsRaw.map((r) => ({ id: r.id, data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown> })) as TableDataRow[],
        };
      },
    });

    // Para cada dataPoint, verificar se deve incluir dados completos
    for (const dataPoint of data) {
      if (dataPoint.recordIds && dataPoint.recordIds.length > 0) {
        try {
          // Buscar registros completos
          const fullRecords = await fetchRecordsForDataPoint(
            dataPoint,
            table,
            service,
            user,
            allTables
          );
          
          // Se for pequeno o suficiente e tiver registros, incluir dados completos
          if (fullRecords.length > 0 && shouldIncludeFullData(fullRecords)) {
            if (!dataPoint.fullRecords) {
              dataPoint.fullRecords = {
                records: fullRecords,
                timestamp: Date.now(),
              };
            }
          }
          // Se não incluir fullRecords, manter apenas recordIds (já está presente)
        } catch (err) {
          // Se houver erro ao buscar registros, continuar sem fullRecords
          // Isso é esperado para tabelas que não existem ou não estão acessíveis
          // O modal ainda funcionará buscando dados via resolveChartDetails
          logger.warn('Failed to fetch full records for dataPoint', { dataPoint: dataPoint.name, error: err });
        }
      }
    }

    return { chart, data };
  } catch (error: unknown) {
    return { chart, data: [], error: error instanceof Error ? error.message : 'Error executing processor' };
  }
}

/**
 * Resolves detailed records for a specific chart data point.
 * Returns paginated records with search, filter, and sort capabilities.
 */
export async function resolveChartDetails(
  user: UserContext,
  chartKey: string,
  dataPointName?: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
) {
  const allGroups: AnalyticsPresetGroup[] = await analyticsService.getAllPresetGroupsAsync(user.userId);
  const chart = allGroups.flatMap((g) => g.charts).find((c) => c.key === chartKey);

  if (!chart) {
    return {
      recordsByTable: {},
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
      importantFields: undefined,
      defaultImportantFields: undefined,
      error: `Chart preset '${chartKey}' not found`,
    };
  }

  const processor = getProcessor(chart.processor);
  if (!processor) {
    return {
      recordsByTable: {},
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
      importantFields: chart.options?.importantFields,
      defaultImportantFields: chart.options?.defaultImportantFields,
      error: `Processor '${chart.processor}' not found`,
    };
  }

  const service = getFactory().getDynamicTableService();
  const allTables = await service.getTablesForUser(user.userId);
  
  // Try to get tableId from params, or infer from pipeline source if using aggregatePipeline
  let tableIdParam = chart.params?.tableId as string | undefined;

  // If no tableId in params and using aggregatePipeline, try to get from pipeline source
  const pipelineParam = chart.params?.pipeline as { source?: { kind: string; key?: string; id?: string } } | undefined;
  if (!tableIdParam && chart.processor === 'aggregatePipeline' && pipelineParam?.source) {
    const source = pipelineParam.source;
    if (source.kind === 'presetTable' && source.key) {
      // Extract preset key from @@PRESET_TABLE_KEY::expenses format
      const presetKey = source.key.startsWith('@@PRESET_TABLE_KEY::')
        ? source.key.replace('@@PRESET_TABLE_KEY::', '')
        : source.key;
      tableIdParam = `@@PRESET_TABLE_KEY::${presetKey}`;
    } else if (source.kind === 'tableId' && source.id) {
      tableIdParam = source.id;
    }
  }

  if (!tableIdParam) {
    return {
      recordsByTable: {},
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
      importantFields: chart.options?.importantFields,
      defaultImportantFields: chart.options?.defaultImportantFields,
      error: 'Missing required param: tableId',
    };
  }

  const resolvedTableId = await resolveTableId(user, tableIdParam, allTables);
  if (!resolvedTableId) {
    return {
      recordsByTable: {},
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
      importantFields: chart.options?.importantFields,
      defaultImportantFields: chart.options?.defaultImportantFields,
      error: `Table not found for key: ${tableIdParam}`,
    };
  }

  // Execute processor to get recordIds for the data point
  const table = await service.getTableById(user, resolvedTableId);
  const allRows = await service.getAllTableData(user, resolvedTableId);

  const processorParams: Record<string, unknown> = {
    ...chart.params,
    tableId: resolvedTableId,
    timeZone: user.timeZone || 'UTC',
  };

  let recordIds: string[] = [];
  let dataPoint: ChartDataPoint | null = null;

  try {
    const data = await processor({
      table,
      schema: table.schema,
      rows: allRows.map((r) => ({
        id: r.id,
        data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>,
      })) as TableDataRow[],
      params: processorParams,
      fetchByPresetTableKey: async (presetTableKey: string) => {
        // Ensure preset key has the proper prefix for resolution
        let keyToResolve = presetTableKey;
        if (!keyToResolve.startsWith('@@PRESET_TABLE_KEY::') && !keyToResolve.startsWith('@@')) {
          keyToResolve = `@@PRESET_TABLE_KEY::${keyToResolve}`;
        }

        const otherTableId = await resolveTableId(user, keyToResolve, allTables);
        if (!otherTableId) {
          throw new Error(`Table not found for key: ${presetTableKey}`);
        }
        const other = await service.getTableById(user, otherTableId);
        const otherRowsRaw = await service.getAllTableData(user, otherTableId);
        return {
          table: other,
          schema: other.schema,
          rows: otherRowsRaw.map((r) => ({ id: r.id, data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown> })) as TableDataRow[],
        };
      },
      fetchByTableId: async (tid: string) => {
        const other = await service.getTableById(user, tid);
        const otherRowsRaw = await service.getAllTableData(user, tid);
        return {
          table: other,
          schema: other.schema,
          rows: otherRowsRaw.map((r) => ({ id: r.id, data: (r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown> })) as TableDataRow[],
        };
      },
    });

    // Find the data point and extract recordIds and tableSource
    dataPoint = dataPointName
      ? (data.find((dp) => dp.name === dataPointName) ?? null)
      : data.length === 1
        ? data[0]
        : null;

    if (dataPoint && dataPoint.recordIds) {
      recordIds = dataPoint.recordIds;
    } else if (!dataPointName && data.length > 0) {
      // If no dataPointName specified and multiple points, collect all IDs
      recordIds = data.reduce((acc: string[], dp) => {
        if (dp.recordIds) {
          acc.push(...dp.recordIds);
        }
        return acc;
      }, []);
      // Remove duplicates
      recordIds = [...new Set(recordIds)];
    }
  } catch (error: unknown) {
    return {
      recordsByTable: {},
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
      importantFields: chart.options?.importantFields,
      defaultImportantFields: chart.options?.defaultImportantFields,
      error: error instanceof Error ? error.message : 'Error executing processor',
    };
  }

  if (recordIds.length === 0) {
    return {
      recordsByTable: {},
      total: 0,
      page: options.page || 1,
      limit: options.limit || 50,
      totalPages: 0,
      importantFields: chart.options?.importantFields,
      defaultImportantFields: chart.options?.defaultImportantFields,
    };
  }

  // Determine which tables to fetch from
  // Priority: dataPoint.tableSource > table.presetKey > processorParams.tableId
  let tableSource = dataPoint?.tableSource;
  
  // If no tableSource from dataPoint, try to get from table or params
  if (!tableSource) {
    // Try to get from table's presetKey or internalName
    tableSource = table.presetKey || table.internalName || String(processorParams.tableId ?? '') || 'sales';
  }
  
  // Map table sources to actual table keys/IDs
  const tablesToFetch: Array<{ key: string; tableId: string; name: string }> = [];
  
  if (tableSource === 'mixed') {
    // For mixed, identify all related tables from params
    const mainTableId = await resolveTableId(user, String(processorParams.tableId ?? ''), allTables);
    if (mainTableId) {
      const mainTable = await service.getTableById(user, mainTableId);
      tablesToFetch.push({
        key: mainTable.presetKey || mainTable.internalName || 'sales',
        tableId: mainTableId,
        name: mainTable.name || 'Vendas',
      });
    }

    // Add expense table if available
    const costSourceTableKey = processorParams.costSourceTableKey as string | undefined;
    const expensesTableKey = processorParams.expensesTableKey as string | undefined;
    if (costSourceTableKey || expensesTableKey) {
      const expenseKey = costSourceTableKey || expensesTableKey;
      if (expenseKey) {
        const expenseTableId = await resolveTableId(user, expenseKey, allTables);
        if (expenseTableId) {
          const expenseTable = await service.getTableById(user, expenseTableId);
          tablesToFetch.push({
            key: expenseTable.presetKey || expenseTable.internalName || 'expenses',
            tableId: expenseTableId,
            name: expenseTable.name || 'Despesas',
          });
        }
      }
    }
  } else {
    // Single table source - resolve it
    // If tableSource is already a preset key (like 'expenses'), convert to @@PRESET_TABLE_KEY:: format
    let tableSourceToResolve = tableSource;
    if (!tableSource.startsWith('@@PRESET_TABLE_KEY::') && !tableSource.startsWith('@@')) {
      tableSourceToResolve = `@@PRESET_TABLE_KEY::${tableSource}`;
    }

    const resolvedTableId = await resolveTableId(user, tableSourceToResolve, allTables);
    if (resolvedTableId) {
      const resolvedTable = await service.getTableById(user, resolvedTableId);
      tablesToFetch.push({
        key: resolvedTable.presetKey || resolvedTable.internalName || tableSource,
        tableId: resolvedTableId,
        name: resolvedTable.name || tableSource,
      });
    }
  }

  // If no tables identified, fallback to main table
  if (tablesToFetch.length === 0) {
    // Use the already resolved table ID from the beginning of the function
    if (resolvedTableId) {
      tablesToFetch.push({
        key: table.presetKey || table.internalName || 'sales',
        tableId: resolvedTableId,
        name: table.name || 'Vendas',
      });
    }
  }

  // Collect table schemas for frontend
  const tableSchemas: Record<string, ITableSchema> = {};
  for (const tableInfo of tablesToFetch) {
    const table = await service.getTableById(user, tableInfo.tableId);
    if (table && table.schema) {
      tableSchemas[tableInfo.key] = table.schema;
    }
  }

  // Fetch records from each table and group by table
  const recordsByTable: Record<string, { tableName: string; tableKey: string; records: TableDataRow[]; total: number }> = {};
  
  for (const tableInfo of tablesToFetch) {
    const tableRows = await service.getAllTableData(user, tableInfo.tableId);
    
    // Filter records that match our recordIds
    const matchingRecords: TableDataRow[] = [];
    for (const row of tableRows) {
      if (recordIds.includes(row.id)) {
        // Ensure data is a Record<string, any>
        const rowData = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
          ? (row.data as Record<string, unknown>)
          : {};
        matchingRecords.push({
          id: row.id,
          data: rowData,
        });
      }
    }

    // Apply search filter
    let filteredRecords = matchingRecords;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filteredRecords = matchingRecords.filter((record) => {
        return Object.values(record.data).some((value) => {
          const str = String(value || '').toLowerCase();
          return str.includes(searchLower);
        });
      });
    }

    // Sort
    if (options.sortBy && options.sortBy.trim()) {
      filteredRecords.sort((a, b) => {
        const aVal = a.data?.[options.sortBy!];
        const bVal = b.data?.[options.sortBy!];
        
        // Handle null/undefined values
        if (aVal === null || aVal === undefined) {
          return options.sortOrder === 'asc' ? -1 : 1;
        }
        if (bVal === null || bVal === undefined) {
          return options.sortOrder === 'asc' ? 1 : -1;
        }
        
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        const isNumeric = Number.isFinite(aNum) && Number.isFinite(bNum);

        let comparison = 0;
        if (isNumeric) {
          comparison = aNum - bNum;
        } else {
          comparison = String(aVal).localeCompare(String(bVal), 'pt-BR');
        }

        return options.sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    // Store records for this table (no pagination per table, pagination is global)
    recordsByTable[tableInfo.key] = {
      tableName: tableInfo.name,
      tableKey: tableInfo.key,
      records: filteredRecords,
      total: filteredRecords.length,
    };
  }

  // Calculate global totals
  const total = Object.values(recordsByTable).reduce((sum, group) => sum + group.total, 0);
  const page = options.page || 1;
  const limit = options.limit || 50;
  const totalPages = Math.ceil(total / limit);

  // Apply global pagination across all tables
  // Combine all records from all tables, then paginate globally
  const allRecords: TableDataRow[] = [];
  const recordToTableMap = new Map<string, string>(); // Map record.id -> tableKey for O(1) lookup
  
  Object.entries(recordsByTable).forEach(([tableKey, group]) => {
    group.records.forEach((record) => {
      allRecords.push(record);
      recordToTableMap.set(record.id, tableKey);
    });
  });

  // Apply global pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedRecords = allRecords.slice(startIndex, endIndex);

  // Redistribute paginated records back to their respective tables
  const paginatedRecordsByTable: Record<string, { tableName: string; tableKey: string; records: TableDataRow[]; total: number }> = {};
  
  // Initialize structure
  Object.keys(recordsByTable).forEach((key) => {
    paginatedRecordsByTable[key] = {
      tableName: recordsByTable[key].tableName,
      tableKey: recordsByTable[key].tableKey,
      records: [],
      total: recordsByTable[key].total, // Keep original total for display
    };
  });

  // Redistribute paginated records using map for O(1) lookup (more efficient than nested loop)
  paginatedRecords.forEach((record) => {
    const tableKey = recordToTableMap.get(record.id);
    if (tableKey && paginatedRecordsByTable[tableKey]) {
      paginatedRecordsByTable[tableKey].records.push(record);
    }
  });

  // Ensure we always return importantFields or defaultImportantFields
  const finalImportantFields = chart.options?.importantFields || {};
  const finalDefaultImportantFields = chart.options?.defaultImportantFields || [];
  
  return {
    recordsByTable: paginatedRecordsByTable,
    total,
    page,
    limit,
    totalPages,
    importantFields: Object.keys(finalImportantFields).length > 0 ? finalImportantFields : undefined,
    defaultImportantFields: finalDefaultImportantFields.length > 0 ? finalDefaultImportantFields : undefined,
    tableSchemas, // NOVO: Schemas das tabelas para resolução de relações no frontend
  };
}
