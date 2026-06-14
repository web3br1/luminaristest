import { useCallback, useEffect, useState } from 'react';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { fetchAllRows } from '../lib/crmFetch';

export interface CrmRecord {
  id: string;
  data: Record<string, any>;
}

export interface CrmKpis {
  totalLeads: number;
  openLeads: number;
  wonLeads: number;
  lostLeads: number;
  pipelineValue: number;
  winRate: number; // 0-100
}

export interface CrmData {
  loading: boolean;
  error: string | null;
  leadsTableId: string | null;
  leads: CrmRecord[];
  stages: CrmRecord[];
  pipelines: CrmRecord[];
  kpis: CrmKpis;
  reload: () => Promise<void>;
}

const EMPTY_KPIS: CrmKpis = {
  totalLeads: 0,
  openLeads: 0,
  wonLeads: 0,
  lostLeads: 0,
  pipelineValue: 0,
  winRate: 0,
};

function resolveTable(tables: any[], internalName: string): any | null {
  return tables.find((t) => t?.internalName === internalName) ?? null;
}

function computeKpis(leads: CrmRecord[]): CrmKpis {
  if (!leads.length) return EMPTY_KPIS;
  let openLeads = 0;
  let wonLeads = 0;
  let lostLeads = 0;
  let pipelineValue = 0;
  for (const lead of leads) {
    const status = String(lead.data?.status ?? 'Open');
    if (status === 'Won') wonLeads++;
    else if (status === 'Lost' || status === 'Disqualified') lostLeads++;
    else openLeads++;
    const amount = Number(lead.data?.latestProposalAmount ?? 0);
    if (Number.isFinite(amount) && status !== 'Lost' && status !== 'Disqualified') {
      pipelineValue += amount;
    }
  }
  const closed = wonLeads + lostLeads;
  const winRate = closed > 0 ? Math.round((wonLeads / closed) * 100) : 0;
  return { totalLeads: leads.length, openLeads, wonLeads, lostLeads, pipelineValue, winRate };
}

/**
 * Loads the CRM data set (leads, stages, pipelines) by resolving the preset
 * tables via their stable `internalName`, then derives top-level KPIs.
 */
export function useCrmData(): CrmData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadsTableId, setLeadsTableId] = useState<string | null>(null);
  const [leads, setLeads] = useState<CrmRecord[]>([]);
  const [stages, setStages] = useState<CrmRecord[]>([]);
  const [pipelines, setPipelines] = useState<CrmRecord[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tablesRes = await DynamicTableService.getTables();
      const tables: any[] = tablesRes?.data ?? tablesRes ?? [];

      const leadsTable = resolveTable(tables, 'leads');
      const stagesTable = resolveTable(tables, 'leadStages');
      const pipelinesTable = resolveTable(tables, 'leadPipelines');
      setLeadsTableId(leadsTable?.id ?? null);

      const pull = async (table: any | null): Promise<CrmRecord[]> => {
        if (!table?.id) return [];
        return (await fetchAllRows(table.id)) as CrmRecord[];
      };

      const [leadRows, stageRows, pipelineRows] = await Promise.all([
        pull(leadsTable),
        pull(stagesTable),
        pull(pipelinesTable),
      ]);

      setLeads(leadRows);
      setStages(stageRows);
      setPipelines(pipelineRows);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar dados do CRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    loading,
    error,
    leadsTableId,
    leads,
    stages,
    pipelines,
    kpis: computeKpis(leads),
    reload,
  };
}
