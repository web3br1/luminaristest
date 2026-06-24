import { useCallback, useEffect, useState } from 'react';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { accountingService } from '../../../lib/services/accounting.service';
import type { TrialBalanceReport } from '../../../lib/services/accounting.service';

export interface UnitOption {
  id: string;
  label: string;
}

interface TableMetaLike {
  id?: unknown;
  name?: unknown;
  internalName?: unknown;
}
interface RowLike {
  id?: unknown;
  data?: Record<string, unknown>;
}

/**
 * Loads the units the user can keep books for, plus the trial balance for the
 * currently-selected unit. Units come from the `units` DynamicTable (the only
 * coupling to DynamicTable — the accounting data itself is first-class Prisma).
 */
export function useAccountingData() {
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState<string>('');
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const tables = await DynamicTableService.getTables();
        const list: TableMetaLike[] = Array.isArray(tables?.data) ? (tables.data as TableMetaLike[]) : [];
        const unitsTable = list.find(
          (t) => t.internalName === 'units' || /unidade|units/i.test(String(t.name ?? '')),
        );
        if (!unitsTable?.id) {
          if (active) {
            setUnits([]);
            setLoadingUnits(false);
          }
          return;
        }
        const rows = await DynamicTableService.getTableData(String(unitsTable.id));
        const data: RowLike[] = Array.isArray(rows?.data) ? (rows.data as RowLike[]) : [];
        const opts: UnitOption[] = data.map((r) => ({
          id: String(r.id),
          label: String(r?.data?.name ?? r?.data?.fantasyName ?? r?.data?.companyName ?? r.id),
        }));
        if (active) {
          setUnits(opts);
          setUnitId(opts[0]?.id ?? '');
          setLoadingUnits(false);
        }
      } catch {
        if (active) {
          setError('Falha ao carregar as unidades.');
          setLoadingUnits(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadReport = useCallback(async (uid: string) => {
    if (!uid) {
      setReport(null);
      return;
    }
    setLoadingReport(true);
    setError(null);
    try {
      const r = await accountingService.getTrialBalance({ unitId: uid });
      setReport(r);
    } catch {
      setError('Falha ao carregar o balancete.');
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    if (unitId) loadReport(unitId);
  }, [unitId, loadReport]);

  return {
    units,
    unitId,
    setUnitId,
    report,
    loadingUnits,
    loadingReport,
    error,
    reload: () => loadReport(unitId),
  };
}
