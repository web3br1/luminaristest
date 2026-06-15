import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError } from '../../../lib/errors';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import type { IDynamicTable, ITableSchema } from '../../dynamicTables/models/DynamicTable.model';
import type { AnalyticsProcessorContext, ChartDataPoint, TableDataRow } from '../../analytics/core';
import {
  crmFunnelProcessor,
  crmConversionProcessor,
  crmSourceProcessor,
  crmStatusProcessor,
  crmBantProcessor,
  crmProposalsByStatusProcessor,
  crmActivitiesByTypeProcessor,
} from '../../analytics/kpis/crm';
import type { CrmAnalyticsInput } from '../dtos/CrmAnalyticsDto';

export interface CrmAnalyticsBundle {
  cards: ChartDataPoint[];
  funnel: ChartDataPoint[];
  source: ChartDataPoint[];
  status: ChartDataPoint[];
  bant: ChartDataPoint[];
  proposals: ChartDataPoint[];
  activities: ChartDataPoint[];
}

/**
 * CrmAnalyticsService — dedicated, isolated CRM analytics. Builds an
 * AnalyticsProcessorContext over the user's `leads` table and runs the CRM KPI
 * processors, returning a single keyed bundle. Reuses the standard
 * `AnalyticsProcessor` contract (processors are also registered for the generic
 * engine) without duplicating the generic resolver.
 */
export class CrmAnalyticsService {
  constructor(
    private readonly dynamicTableService: DynamicTableService,
    private readonly repository: IDynamicTableRepository,
  ) {}

  private async resolveTable(user: UserContext, internalName: string): Promise<IDynamicTable> {
    const table = await this.repository.findTableByInternalName(user.userId, internalName);
    if (!table) throw new NotFoundError(`CRM table '${internalName}' não está instalada para este usuário.`);
    return table;
  }

  /** Load all rows of a table, injecting record-level timestamps into `data` (the analytics context drops them). */
  private async loadRows(user: UserContext, table: IDynamicTable): Promise<TableDataRow[]> {
    const data = await this.dynamicTableService.getAllTableData(user, table.id);
    return data.map((d) => ({
      id: d.id,
      data: { ...((d.data as Record<string, unknown>) || {}), _createdAt: d.createdAt, _updatedAt: d.updatedAt },
    }));
  }

  async getAnalytics(user: UserContext, input: CrmAnalyticsInput): Promise<CrmAnalyticsBundle> {
    const leadsTable = await this.resolveTable(user, 'leads');
    const rows = await this.loadRows(user, leadsTable);

    const ctx: AnalyticsProcessorContext = {
      table: leadsTable,
      schema: leadsTable.schema as unknown as ITableSchema,
      rows,
      params: {
        datePreset: input.datePreset || 'thisYear',
        timeZone: input.timeZone || 'UTC',
      },
      fetchByPresetTableKey: async (key: string) => {
        const t = await this.repository.findTableByInternalName(user.userId, key);
        if (!t) return { table: leadsTable, schema: leadsTable.schema as unknown as ITableSchema, rows: [] };
        return { table: t, schema: t.schema as unknown as ITableSchema, rows: await this.loadRows(user, t) };
      },
    };

    const [funnel, cards, source, status, bant, proposals, activities] = await Promise.all([
      Promise.resolve(crmFunnelProcessor(ctx)),
      Promise.resolve(crmConversionProcessor(ctx)),
      Promise.resolve(crmSourceProcessor(ctx)),
      Promise.resolve(crmStatusProcessor(ctx)),
      Promise.resolve(crmBantProcessor(ctx)),
      Promise.resolve(crmProposalsByStatusProcessor(ctx)),
      Promise.resolve(crmActivitiesByTypeProcessor(ctx)),
    ]);

    return { cards, funnel, source, status, bant, proposals, activities };
  }
}
