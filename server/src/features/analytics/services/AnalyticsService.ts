/**
 * Analytics Service
 *
 * Combines analytics templates with system preset configurations
 * to generate analytics preset groups for the frontend.
 */

import { tablePresetSuites } from '../../dynamicTables/presets';
import type { AnalyticsPresetGroup, ChartPreset, ChartType } from '../core/models/ChartPreset';
import type { AnalyticsConfiguration } from '../core/models/AnalyticsConfiguration';
import type { PipelineSpec } from '../core/pipeline/Pipeline';
import { getTemplate } from '../core';
import { mapConfigurationToProcessorParams, getProcessorKeyFromConfig } from '../engine/FieldMapper';
import { validateConfigurations } from './AnalyticsValidator';
import { kpiCacheService } from './KpiCacheService';
import { getFactory } from '@/lib/factory';
import { logger } from '@/lib/logger';
import type { IDynamicTable, ITableSchema } from '../../dynamicTables/models/DynamicTable.model';
import type { PresetTableDefinition, PresetSuite } from '../../dynamicTables/presets';
import type { UserContext } from '@/types/UserContext';

/**
 * Extended preset suite type that includes key and analytics properties.
 */
interface ExtendedPresetSuite extends PresetSuite {
  key?: string;
  analytics?: AnalyticsConfiguration[] | AnalyticsPresetGroup[];
}

/**
 * Structure of analytics definition data from the database.
 */
interface AnalyticsDefinitionData {
  key?: string;
  title?: string;
  chartType?: ChartType;
  scope?: 'global' | 'preset' | 'table';
  presetKey?: string;
  tableKey?: string;
  pipeline?: PipelineSpec;
  options?: Record<string, unknown>;
  published?: boolean;
}

/**
 * Structure of an analytics definition row from the database.
 */
interface AnalyticsDefinitionRow {
  id: string;
  data?: AnalyticsDefinitionData;
}

class AnalyticsService {
  /**
   * Async: merges system-level, table-level, and CORE (DB) analytics.
   * This version is dynamic and respects the user's active tables.
   */
  public async getAllPresetGroupsAsync(
    userId: string,
    presetKeyFilter?: string
  ): Promise<AnalyticsPresetGroup[]> {
    const cacheKey = `${userId}:${presetKeyFilter ?? ''}`;
    const cached = kpiCacheService.get(cacheKey);
    if (cached !== null) {
      return cached as AnalyticsPresetGroup[];
    }

    const dtService = getFactory().getDynamicTableService();
    const allTables = await dtService.getTablesForUser(userId);

    // Map of internalName -> tableId for quick lookup
    const userTableMap = new Map<string, string>();
    const userTableSchemas = new Map<string, ITableSchema>();

    for (const t of allTables) {
      const internalName = t.internalName || t.presetKey || t.name;
      if (internalName) {
        userTableMap.set(internalName, t.id);
        userTableSchemas.set(internalName, t.schema as ITableSchema);
      }
    }

    // Capture code groups dynamically based on ALIVE tables
    const codeGroups = this.getDynamicPresetGroups(userTableMap, userTableSchemas, presetKeyFilter);

    // Load CORE definitions (analyticsDefinitions) if present
    const coreTable = allTables.find(
      (t: IDynamicTable) => t.internalName === 'analyticsDefinitions' || t.name === 'Analytics Definitions'
    );

    if (!coreTable) {
      kpiCacheService.set(cacheKey, codeGroups);
      return codeGroups;
    }

    // Create minimal user context for getTableData call
    // Note: getTableData requires full UserContext but we only have userId
    // Using a partial cast as this is an internal service call with only userId available
    const userContext = { id: userId, userId } as UserContext;
    const defs = await dtService.getAllTableData(userContext, coreTable.id);

    // Convert CORE definitions (pipeline) to ChartPreset
    const coreGroupsMap = new Map<string, ChartPreset[]>();

    for (const def of defs as AnalyticsDefinitionRow[]) {
      const data = (def.data || {}) as AnalyticsDefinitionData;
      if (data.published === false) continue;

      // Scope filtering
      if (
        presetKeyFilter &&
        data.scope === 'preset' &&
        data.presetKey &&
        data.presetKey !== presetKeyFilter
      ) {
        continue;
      }

      const key: string = String(data.key || def.id);
      const title: string = String(data.title || key);
      const chartType: ChartType = (data.chartType || 'bar') as ChartType;
      const options = (data.options || {}) as Record<string, unknown>;
      const pipeline: PipelineSpec | undefined = data.pipeline;

      if (!pipeline) continue;

      // Resolve tableId from pipeline source
      let tableId: string;
      if (pipeline.source.kind === 'presetTable') {
        tableId = pipeline.source.key;
      } else if (pipeline.source.kind === 'tableId') {
        tableId = pipeline.source.id;
      } else {
        // Invalid source type, skip this definition
        logger.warn(`Invalid pipeline source kind for definition '${key}'`, {
          source: pipeline.source,
        });
        continue;
      }

      const groupKey =
        data.scope === 'global'
          ? 'core.global'
          : data.scope === 'table' && data.tableKey
            ? `core.${String(data.tableKey).replace('@@PRESET_TABLE_KEY::', '')}`
            : data.scope === 'preset' && data.presetKey
              ? `core.${data.presetKey}`
              : 'core.custom';

      if (!coreGroupsMap.has(groupKey)) coreGroupsMap.set(groupKey, []);

      coreGroupsMap.get(groupKey)!.push({
        key: `core.${key}`,
        title,
        type: chartType,
        processor: 'aggregatePipeline',
        params: {
          pipeline,
          tableId,
        },
        options,
      });
    }

    const coreGroups: AnalyticsPresetGroup[] = [];
    for (const [groupKey, charts] of coreGroupsMap.entries()) {
      coreGroups.push({
        key: groupKey,
        title: `${groupKey.split('.').pop() || 'CORE'} - Análises`,
        charts,
      });
    }

    const result = [...codeGroups, ...coreGroups];
    kpiCacheService.set(cacheKey, result);
    return result;
  }

  /**
   * Gets analytics preset groups from system presets based on available user tables.
   */
  public getDynamicPresetGroups(
    userTableMap: Map<string, string>,
    userTableSchemas: Map<string, ITableSchema>,
    presetKeyFilter?: string
  ): AnalyticsPresetGroup[] {
    const groups: AnalyticsPresetGroup[] = [];
    const processedConfigs = new Set<string>();

    for (const category of Object.values(tablePresetSuites)) {
      for (const preset of Object.values(category)) {
        const presetObj = preset as ExtendedPresetSuite;

        // Optional: Filter by specific preset key if requested
        if (presetKeyFilter && presetObj.key !== presetKeyFilter) {
          continue;
        }

        const tables: Record<string, PresetTableDefinition> = presetObj.tables || {};
        const availableConfigsInPreset: AnalyticsConfiguration[] = [];

        // 1) Collect Table-level analytics for tables the user actually has
        for (const [tableKeyName, tableDef] of Object.entries(tables)) {
          if (!userTableMap.has(tableKeyName)) continue;

          const tAnalytics = tableDef.analytics;
          if (!Array.isArray(tAnalytics) || tAnalytics.length === 0) continue;

          for (const rawConfig of tAnalytics) {
            const configKey = `${presetObj.key}.${tableKeyName}.${rawConfig.key}`;
            if (processedConfigs.has(configKey)) continue;

            const config: AnalyticsConfiguration = {
              ...rawConfig,
              tableKey:
                !rawConfig.tableKey || rawConfig.tableKey === '@@TABLE_SELF@@'
                  ? `@@PRESET_TABLE_KEY::${tableKeyName}`
                  : rawConfig.tableKey,
              key:
                typeof rawConfig.key === 'string' && rawConfig.key.includes('.')
                  ? rawConfig.key
                  : `${tableKeyName}.${rawConfig.key}`,
            };

            // Dependency Check: Does this config require other tables that the user doesn't have?
            if (this.isConfigSupported(config, userTableMap)) {
              availableConfigsInPreset.push(config);
              processedConfigs.add(configKey);
            }
          }
        }

        // 2) Collect System-level analytics (preset.analytics)
        const systemConfigs = Array.isArray(presetObj.analytics)
          ? (presetObj.analytics as AnalyticsConfiguration[])
          : [];

        for (const rawConfig of systemConfigs) {
          const configKey = `${presetObj.key}.system.${rawConfig.key}`;
          if (processedConfigs.has(configKey)) continue;

          if (this.isConfigSupported(rawConfig, userTableMap)) {
            availableConfigsInPreset.push(rawConfig);
            processedConfigs.add(configKey);
          }
        }

        // --- Schema-Aware Validation (Phase 1) ---
        if (availableConfigsInPreset.length > 0) {
          const validation = validateConfigurations(availableConfigsInPreset, userTableSchemas);
          if (!validation.valid) {
            logger.warn(`[Analytics] Configuration errors found in preset '${presetObj.key}':`, {
              errors: validation.errors.map(e => `${e.field}: ${e.message}`),
            });
            // Still proceed but specific bad charts will be handled by resolver
          }

          const presetKey = presetObj.key || 'unknown';
          const presetGroups = this.convertConfigurationsToGroups(availableConfigsInPreset, presetKey);
          groups.push(...presetGroups);
        }
      }
    }

    return groups;
  }

  /**
   * Helper: Checks if all table dependencies in an analytics config are met by the user's tables.
   */
  private isConfigSupported(config: AnalyticsConfiguration, userTableMap: Map<string, string>): boolean {
    // 1. Check primary table
    const primaryTable = config.tableKey.replace('@@PRESET_TABLE_KEY::', '');
    if (primaryTable !== '@@TABLE_SELF@@' && !userTableMap.has(primaryTable)) {
      return false;
    }

    // 2. Check dependencies in params (e.g. costSourceTableKey)
    const params = config.params || {};
    for (const value of Object.values(params)) {
      if (typeof value === 'string' && value.startsWith('@@PRESET_TABLE_KEY::')) {
        const depTable = value.replace('@@PRESET_TABLE_KEY::', '');
        if (!userTableMap.has(depTable)) {
          return false;
        }
      }
    }

    // 3. Check dependencies in pipeline source
    const pipelineCfg = params.pipeline as { source?: { kind: string; key: string } } | undefined;
    if (config.templateKey === 'aggregatePipeline' && pipelineCfg?.source?.kind === 'presetTable') {
      const depTable = (pipelineCfg.source?.key || '').replace('@@PRESET_TABLE_KEY::', '');
      if (!userTableMap.has(depTable)) {
        return false;
      }
    }

    return true;
  }

  /**
   * DEPRECATED: Use getAllPresetGroupsAsync for dynamic discovery.
   * Gets analytics preset groups from system presets.
   */
  public getAllPresetGroups(_presetKeyFilter?: string): AnalyticsPresetGroup[] {
    // This is now just a wrapper for legacy calls, 
    // though most calls should migrate to the async version for userId context.
    return [];
  }

  /**
   * Converts analytics configurations to AnalyticsPresetGroup format.
   */
  private convertConfigurationsToGroups(
    configs: AnalyticsConfiguration[],
    presetKey: string
  ): AnalyticsPresetGroup[] {
    const groupsMap = new Map<string, ChartPreset[]>();

    for (const config of configs) {
      const template = getTemplate(config.templateKey);
      if (!template) {
        logger.warn(`Template '${config.templateKey}' not found for config '${config.key}'`, {
          configKey: config.key,
          templateKey: config.templateKey,
        });
        continue;
      }

      const groupKey = config.key.split('.')[0] || 'default';

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }

      const processorParams = mapConfigurationToProcessorParams(config);

      const chartPreset: ChartPreset = {
        key: config.key,
        title: config.title,
        description: config.description,
        type: config.type,
        processor: getProcessorKeyFromConfig(config),
        params: {
          ...processorParams,
          tableId: config.tableKey,
        },
        options: {
          ...template.defaultOptions,
          ...config.options,
          // Copy labelMap from params to options for frontend access
          ...(processorParams.labelMap ? { labelMap: processorParams.labelMap as Record<string, string> } : {}),
        },
      };

      groupsMap.get(groupKey)!.push(chartPreset);
    }

    const groups: AnalyticsPresetGroup[] = [];
    for (const [groupKey, charts] of groupsMap.entries()) {
      groups.push({
        key: `${presetKey}.${groupKey}`,
        title: this.getGroupTitle(groupKey, charts),
        charts,
      });
    }

    return groups;
  }

  /**
   * Generates a title for an analytics group based on its charts.
   */
  private getGroupTitle(groupKey: string, charts: ChartPreset[]): string {
    const titleMap: Record<string, string> = {
      costkpis: 'Custos & Despesas',
      productcostkpis: 'Custos Operacionais de Produtos',
      revenuekpis: 'Indicadores de Receita',
      profitkpi: 'Resultado e Lucratividade',
      salesprofitbyproductovertime: 'Lucro por Produto (Série Temporal)',
      aggregatepipeline: 'Análises Agregadas Customizadas',
      formulacalculation: 'Métricas Combinadas e Fórmulas',
      temporalaggregation: 'Análises e Séries Temporais',
      profitbydimension: 'Análise de Lucro por Dimensão',
      sales: 'Vendas Globais',
      expenses: 'Despesas Globais',
    };

    const normalizeKey = groupKey.toLowerCase();
    if (titleMap[normalizeKey]) {
      return titleMap[normalizeKey];
    }

    if (charts.length > 0) {
      const firstTitle = charts[0].title;
      if (firstTitle.includes('Vendas') || firstTitle.includes('Sales')) {
        return 'Vendas (Geral)';
      }
      if (firstTitle.includes('Despesas') || firstTitle.includes('Expenses')) {
        return 'Despesas (Geral)';
      }
    }
    return `${groupKey.charAt(0).toUpperCase() + groupKey.slice(1)} - Análises`;
  }

  /**
   * Discovers potential KPIs for a specific table based on its schema.
   */
  public async discoverKPIsAsync(
    userId: string,
    tableId: string
  ): Promise<AnalyticsPresetGroup[]> {
    const dtService = getFactory().getDynamicTableService();
    // getTableById and getTableData require a context that has at least the user ID
    const userContext = { id: userId, userId } as UserContext;

    try {
      const table = await dtService.getTableById(userContext, tableId);
      if (!table || !table.schema) {
        logger.warn(`[Analytics Discovery] Table ${tableId} not found or has no schema.`);
        return [];
      }

      const schema = table.schema as ITableSchema;
      const fields = schema.fields || [];
      const charts: ChartPreset[] = [];

      // 1. Identify Numeric, Date and Categorical Fields
      const numericFields = fields.filter(f => f.type === 'number');
      const dateFields = fields.filter(f => ['date', 'datetime'].includes(f.type));
      const categoricalFields = fields.filter(f => ['select', 'relation', 'status', 'tag'].includes(f.type));

      const dateField = dateFields[0]?.name;

      for (const field of numericFields) {
        // Metric Card (Total)
        charts.push({
          key: `discovered.${tableId}.${field.name}.sum`,
          title: `Total de ${field.label || field.name}`,
          type: 'card',
          processor: 'aggregatePipeline',
          params: {
            tableId: tableId,
            pipeline: {
              source: { kind: 'tableId', id: tableId },
              measures: [{ type: 'sum', field: field.name, alias: field.label || field.name }],
              dimensions: []
            }
          },
          options: {}
        });

        // Metric Card (Average)
        charts.push({
          key: `discovered.${tableId}.${field.name}.avg`,
          title: `Média de ${field.label || field.name}`,
          type: 'card',
          processor: 'aggregatePipeline',
          params: {
            tableId: tableId,
            pipeline: {
              source: { kind: 'tableId', id: tableId },
              measures: [{ type: 'avg', field: field.name, alias: `Média ${field.label || field.name}` }],
              dimensions: []
            }
          }
        });

        // Trend Line (if date field exists)
        if (dateField) {
          charts.push({
            key: `discovered.${tableId}.${field.name}.trend`,
            title: `Tendência: ${field.label || field.name}`,
            type: 'line',
            processor: 'aggregatePipeline',
            params: {
              tableId: tableId,
              pipeline: {
                source: { kind: 'tableId', id: tableId },
                measures: [{ type: 'sum', field: field.name, alias: field.label || field.name }],
                dimensions: [{ type: 'period', dateField: dateField, period: 'month' }]
              }
            }
          });
        }
      }

      // 2. Identify Categorical Fields for Distributions
      for (const field of categoricalFields) {
        charts.push({
          key: `discovered.${tableId}.${field.name}.dist`,
          title: `Distribuição por ${field.label || field.name}`,
          type: 'pie',
          processor: 'aggregatePipeline',
          params: {
            tableId: tableId,
            pipeline: {
              source: { kind: 'tableId', id: tableId },
              measures: [{ type: 'count', alias: 'Total' }],
              dimensions: [{ type: 'field', field: field.name }]
            }
          }
        });
      }

      // 3. Identification of Time-Series (Volume Trend)
      if (dateField) {
        charts.push({
          key: `discovered.${tableId}.volumeTrend`,
          title: `Volume de Registros: ${table.name}`,
          type: 'line',
          processor: 'aggregatePipeline',
          params: {
            tableId: tableId,
            pipeline: {
              source: { kind: 'tableId', id: tableId },
              measures: [{ type: 'count', alias: 'Volume' }],
              dimensions: [{ type: 'period', dateField: dateField, period: 'month' }]
            }
          }
        });
      }

      // 4. Simple Count KPI
      charts.push({
        key: `discovered.${tableId}.count`,
        title: `Total de Registros (${table.name})`,
        type: 'card',
        processor: 'aggregatePipeline',
        params: {
          tableId: tableId,
          pipeline: {
            source: { kind: 'tableId', id: tableId },
            measures: [{ type: 'count', alias: 'Total' }],
            dimensions: []
          }
        }
      });

      if (charts.length === 0) return [];

      return [{
        key: `discovered.${tableId}`,
        title: `Descobertas: ${table.name}`,
        charts: charts
      }];
    } catch (err) {
      logger.error(`[Analytics Discovery] Error discovering KPIs for table ${tableId}:`, { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
}

export const analyticsService = new AnalyticsService();
