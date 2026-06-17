'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { CrmService, type AdvanceOpportunityPayload } from '../../../lib/services/crm.service';
import type { ITableSchema } from '../../dashboard/components/shared/dynamic-tables.client';
import { useCrmData, type CrmRecord } from './useCrmData';
import { useOwnerFilter, type OwnerOption } from './useOwnerFilter';
import type { PipelineColumn, ProposalCapture } from './useCrmPipelineBoard';

export type { PipelineColumn, ProposalCapture } from './useCrmPipelineBoard';

/** Pending transition awaiting proposal-capture input from the board modal. */
export interface PendingOppProposal {
  opportunityId: string;
  stage: PipelineColumn;
}

export interface OppPipelineBoardState {
  loading: boolean;
  error: string | null;
  /** False when the `crmOpportunities` table is not installed in this tenant. */
  notInstalled: boolean;
  pipelines: CrmRecord[];
  /** Raw stage records (all pipelines) — for Opp360 next-stage resolution. */
  stages: CrmRecord[];
  activePipelineId: string | null;
  setActivePipelineId: (id: string) => void;
  columns: PipelineColumn[];
  opportunitiesByStage: Map<string, CrmRecord[]>;
  /** Flat lookup of ALL (unfiltered) opportunities by id — for modal resolution that
   *  must survive the owner filter. */
  oppById: Map<string, CrmRecord>;
  activeOpportunity: CrmRecord | null;
  /** Owner ("vendedor") filter — options + selection, applied to the board. */
  ownerOptions: OwnerOption[];
  selectedOwnerId: string;
  setSelectedOwnerId: (id: string) => void;
  showOwnerFilter: boolean;
  /** "Meus registros" toggle state + gate. */
  mine: boolean;
  setMine: (mine: boolean) => void;
  canUseMine: boolean;
  /** Set while a drop targeted a `proposal` stage and awaits amount input. */
  pendingProposal: PendingOppProposal | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  confirmProposal: (capture: ProposalCapture) => Promise<void>;
  cancelProposal: () => void;
  reload: () => Promise<void>;
}

/**
 * Board logic for the first-class Opportunity pipeline. Mirrors
 * `useCrmPipelineBoard` (optimistic move + rollback) but over `crmOpportunities`
 * instead of leads, running the atomic `CrmService.advanceOpportunity` transition
 * (closes the opp on `closed_won`/`closed_lost` stages). Columns are the active
 * pipeline's stages only (reused from leadStages). Degrades gracefully to an empty
 * board with `notInstalled` when the `crmOpportunities` table is absent.
 */
export function useOppPipelineBoard(): OppPipelineBoardState {
  const {
    loading,
    error,
    stages,
    pipelines,
    opportunities,
    opportunitiesTableId,
    opportunitiesInstalled,
    reload,
  } = useCrmData();

  const [pipelineOverride, setPipelineOverride] = useState<string | null>(null);
  const [localOpps, setLocalOpps] = useState<CrmRecord[]>([]);
  const [activeOpportunity, setActiveOpportunity] = useState<CrmRecord | null>(null);
  const [pendingProposal, setPendingProposal] = useState<PendingOppProposal | null>(null);
  const [oppsSchema, setOppsSchema] = useState<ITableSchema | null>(null);

  // Optimistic mirror of the server opportunities.
  useEffect(() => {
    setLocalOpps(opportunities);
  }, [opportunities]);

  // Resolve the opportunities table schema (needed by the owner-filter detection).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!opportunitiesTableId) {
        setOppsSchema(null);
        return;
      }
      try {
        const meta = await DynamicTableService.getTableById(opportunitiesTableId);
        const schema = (meta?.schema ?? null) as ITableSchema | null;
        if (!cancelled) setOppsSchema(schema);
      } catch {
        if (!cancelled) setOppsSchema(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opportunitiesTableId]);

  // Default to the pipeline holding the most opportunities so the board is never
  // empty when several pipelines exist (mirror of the lead board logic).
  const defaultPipelineId = useMemo(() => {
    if (!pipelines.length) return null;
    const counts = new Map<string, number>();
    for (const o of opportunities) {
      const pid = String(o.data?.pipelineId ?? '');
      if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    let best = pipelines[0].id;
    let max = -1;
    for (const p of pipelines) {
      const c = counts.get(p.id) ?? 0;
      if (c > max) {
        max = c;
        best = p.id;
      }
    }
    return best;
  }, [pipelines, opportunities]);

  const activePipelineId = pipelineOverride ?? defaultPipelineId;

  // Columns = stages of the ACTIVE pipeline only, sorted by `order`.
  const columns = useMemo<PipelineColumn[]>(
    () =>
      stages
        .filter((s) => !activePipelineId || String(s.data?.pipelineId ?? '') === activePipelineId)
        .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0))
        .map((s) => ({
          id: s.id,
          title: String(s.data?.name ?? 'Etapa'),
          stageType: String(s.data?.type ?? ''),
          order: Number(s.data?.order ?? 0),
        })),
    [stages, activePipelineId],
  );

  // Owner ("vendedor") filter — auto-detected from the opportunities schema relation.
  const {
    options: ownerOptions,
    selectedOwnerId,
    setSelectedOwnerId,
    hasMultipleOwners,
    mine,
    setMine,
    canUseMine,
    filterByOwner,
  } = useOwnerFilter(oppsSchema, opportunities);

  const visibleOpps = useMemo(() => filterByOwner(localOpps), [filterByOwner, localOpps]);

  // Flat lookup over the UNFILTERED optimistic opps — modal resolution must not be
  // affected when the owner filter hides an opp while its detail modal is open.
  const oppById = useMemo(() => {
    const m = new Map<string, CrmRecord>();
    for (const o of localOpps) m.set(o.id, o);
    return m;
  }, [localOpps]);

  const opportunitiesByStage = useMemo(() => {
    const m = new Map<string, CrmRecord[]>();
    for (const o of visibleOpps) {
      const sid = String(o.data?.stageId ?? '');
      const bucket = m.get(sid);
      if (bucket) bucket.push(o);
      else m.set(sid, [o]);
    }
    return m;
  }, [visibleOpps]);

  const setActivePipelineId = useCallback((id: string) => setPipelineOverride(id), []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const opp = localOpps.find((o) => o.id === String(event.active.id)) ?? null;
      setActiveOpportunity(opp);
    },
    [localOpps],
  );

  // Apply an optimistic stageId move and return the pre-move snapshot for rollback.
  const applyOptimisticMove = useCallback(
    (opportunityId: string, stageId: string): CrmRecord[] => {
      const snapshot = localOpps.map((o) => ({ ...o, data: { ...o.data } }));
      setLocalOpps((prev) =>
        prev.map((o) => (o.id === opportunityId ? { ...o, data: { ...o.data, stageId } } : o)),
      );
      return snapshot;
    },
    [localOpps],
  );

  // Run the atomic transition; rollback to the snapshot on error.
  const runTransition = useCallback(
    async (payload: AdvanceOpportunityPayload, snapshot: CrmRecord[]) => {
      try {
        await CrmService.advanceOpportunity(payload);
        await reload();
      } catch (e) {
        console.error('[OppPipelineBoard] advanceOpportunity failed', e);
        setLocalOpps(snapshot);
      }
    },
    [reload],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveOpportunity(null);
      if (!over) return;

      const opportunityId = String(active.id);
      const overId = String(over.id);
      const overOpp = localOpps.find((o) => o.id === overId);
      const targetStageId =
        columns.find((c) => c.id === overId)?.id ??
        (overOpp ? String(overOpp.data?.stageId ?? '') : undefined);
      const targetStage = columns.find((c) => c.id === targetStageId);
      if (!targetStage) return; // dropped outside a known column

      const opp = localOpps.find((o) => o.id === opportunityId);
      if (!opp || String(opp.data?.stageId ?? '') === targetStage.id) return; // no-op

      const snapshot = applyOptimisticMove(opportunityId, targetStage.id);

      // Proposal stages require extra input — defer the call to the capture modal.
      if (targetStage.stageType === 'proposal') {
        setPendingProposal({ opportunityId, stage: targetStage });
        return;
      }

      void runTransition(
        { opportunityId, stageId: targetStage.id, stageType: targetStage.stageType },
        snapshot,
      );
    },
    [columns, localOpps, applyOptimisticMove, runTransition],
  );

  const confirmProposal = useCallback(
    async (capture: ProposalCapture) => {
      if (!pendingProposal) return;
      const { opportunityId, stage } = pendingProposal;
      // localOpps already reflects the optimistic move; rebuild a rollback snapshot
      // that restores the opp to its server-side stage.
      const serverOpp = opportunities.find((o) => o.id === opportunityId);
      const snapshot = localOpps.map((o) =>
        o.id === opportunityId && serverOpp ? { ...o, data: { ...serverOpp.data } } : o,
      );
      setPendingProposal(null);
      await runTransition(
        {
          opportunityId,
          stageId: stage.id,
          stageType: stage.stageType,
          amount: capture.amount,
          currency: capture.currency,
          winProbability: capture.winProbability,
        },
        snapshot,
      );
    },
    [pendingProposal, opportunities, localOpps, runTransition],
  );

  const cancelProposal = useCallback(() => {
    if (!pendingProposal) return;
    // Roll the optimistic move back to the server stage.
    setLocalOpps(opportunities.map((o) => ({ ...o, data: { ...o.data } })));
    setPendingProposal(null);
  }, [pendingProposal, opportunities]);

  return {
    loading,
    error,
    notInstalled: !loading && !opportunitiesInstalled,
    pipelines,
    stages,
    activePipelineId,
    setActivePipelineId,
    columns,
    opportunitiesByStage,
    oppById,
    activeOpportunity,
    ownerOptions,
    selectedOwnerId,
    setSelectedOwnerId,
    showOwnerFilter: hasMultipleOwners,
    mine,
    setMine,
    canUseMine,
    pendingProposal,
    handleDragStart,
    handleDragEnd,
    confirmProposal,
    cancelProposal,
    reload,
  };
}
