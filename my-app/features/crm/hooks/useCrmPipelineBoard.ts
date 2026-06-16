'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { CrmService, type AdvanceStagePayload } from '../../../lib/services/crm.service';
import type { ITableSchema } from '../../dashboard/components/shared/dynamic-tables.client';
import { useCrmData, type CrmRecord } from './useCrmData';

/** A pipeline stage projected as a Kanban column. */
export interface PipelineColumn {
  id: string;
  title: string;
  stageType: string;
  order: number;
}

/** Extra fields captured before a transition into a `proposal` stage. */
export interface ProposalCapture {
  amount: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  winProbability?: number;
}

/** Pending transition awaiting proposal-capture input from the board modal. */
export interface PendingProposal {
  leadId: string;
  stage: PipelineColumn;
}

export interface CrmPipelineBoardState {
  loading: boolean;
  error: string | null;
  pipelines: CrmRecord[];
  /** Raw stage records (all pipelines) — for Lead360 next-stage resolution. */
  stages: CrmRecord[];
  activePipelineId: string | null;
  setActivePipelineId: (id: string) => void;
  columns: PipelineColumn[];
  leadsByStage: Map<string, CrmRecord[]>;
  activeLead: CrmRecord | null;
  /** Leads table id + schema, for the FloatingActionButton create-lead form. */
  leadsTableId: string | null;
  leadsSchema: ITableSchema | null;
  /** Set while a drop targeted a `proposal` stage and awaits amount input. */
  pendingProposal: PendingProposal | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  /** Confirm the proposal-capture modal: runs the transition with captured fields. */
  confirmProposal: (capture: ProposalCapture) => Promise<void>;
  /** Cancel the proposal-capture modal: rolls back the optimistic move. */
  cancelProposal: () => void;
  reload: () => Promise<void>;
}

/**
 * Board logic for the CRM pipeline. Mirrors `useKanbanLogic` (optimistic move +
 * rollback) but the transition runs through the atomic `CrmService.advanceStage`
 * endpoint (which has side effects, e.g. proposal creation) instead of a partial
 * `updateRecord`. Columns are the active pipeline's stages only.
 */
export function useCrmPipelineBoard(): CrmPipelineBoardState {
  const { loading, error, leads, stages, pipelines, leadsTableId, reload } = useCrmData();

  const [pipelineOverride, setPipelineOverride] = useState<string | null>(null);
  const [localLeads, setLocalLeads] = useState<CrmRecord[]>([]);
  const [activeLead, setActiveLead] = useState<CrmRecord | null>(null);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [leadsSchema, setLeadsSchema] = useState<ITableSchema | null>(null);

  // Optimistic mirror of the server leads (pattern of useKanbanLogic.localTasks).
  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  // Resolve the leads table schema (needed by the create-lead FloatingActionButton).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!leadsTableId) {
        setLeadsSchema(null);
        return;
      }
      try {
        const meta = await DynamicTableService.getTableById(leadsTableId);
        const schema = (meta?.schema ?? null) as ITableSchema | null;
        if (!cancelled) setLeadsSchema(schema);
      } catch {
        if (!cancelled) setLeadsSchema(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadsTableId]);

  // Default to the pipeline holding the most leads so the board is never empty
  // when several pipelines exist (preserved from the original pipeline.tsx logic).
  const defaultPipelineId = useMemo(() => {
    if (!pipelines.length) return null;
    const counts = new Map<string, number>();
    for (const l of leads) {
      const pid = String(l.data?.pipelineId ?? '');
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
  }, [pipelines, leads]);

  const activePipelineId = pipelineOverride ?? defaultPipelineId;

  // Columns = stages of the ACTIVE pipeline only, sorted by `order`. Filtering by
  // pipeline avoids duplicate/empty columns when stage names repeat across pipelines.
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

  const leadsByStage = useMemo(() => {
    const m = new Map<string, CrmRecord[]>();
    for (const l of localLeads) {
      const sid = String(l.data?.stageId ?? '');
      const bucket = m.get(sid);
      if (bucket) bucket.push(l);
      else m.set(sid, [l]);
    }
    return m;
  }, [localLeads]);

  const setActivePipelineId = useCallback((id: string) => setPipelineOverride(id), []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const lead = localLeads.find((l) => l.id === String(event.active.id)) ?? null;
      setActiveLead(lead);
    },
    [localLeads],
  );

  // Apply an optimistic stageId move and return the pre-move snapshot for rollback.
  const applyOptimisticMove = useCallback(
    (leadId: string, stageId: string): CrmRecord[] => {
      const snapshot = localLeads.map((l) => ({ ...l, data: { ...l.data } }));
      setLocalLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, data: { ...l.data, stageId } } : l)),
      );
      return snapshot;
    },
    [localLeads],
  );

  // Run the atomic transition; rollback to the snapshot on error (pattern of
  // useKanbanLogic.handleDragEnd, but via advanceStage instead of updateRecord).
  const runTransition = useCallback(
    async (payload: AdvanceStagePayload, snapshot: CrmRecord[]) => {
      try {
        await CrmService.advanceStage(payload);
        await reload();
      } catch (e) {
        console.error('[CrmPipelineBoard] advanceStage failed', e);
        setLocalLeads(snapshot);
      }
    },
    [reload],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveLead(null);
      if (!over) return;

      const leadId = String(active.id);
      // closestCenter + sortable cards mean `over.id` can be either a column id OR
      // a lead id (when dropping onto a non-empty column). Resolve the target stage
      // from a column id directly, or from the stage that owns the card under cursor.
      const overId = String(over.id);
      const overLead = localLeads.find((l) => l.id === overId);
      const targetStageId =
        columns.find((c) => c.id === overId)?.id ??
        (overLead ? String(overLead.data?.stageId ?? '') : undefined);
      const targetStage = columns.find((c) => c.id === targetStageId);
      if (!targetStage) return; // dropped outside a known column

      const lead = localLeads.find((l) => l.id === leadId);
      if (!lead || String(lead.data?.stageId ?? '') === targetStage.id) return; // no-op

      const snapshot = applyOptimisticMove(leadId, targetStage.id);

      // Proposal stages require extra input — defer the call to the capture modal.
      if (targetStage.stageType === 'proposal') {
        setPendingProposal({ leadId, stage: targetStage });
        return;
      }

      void runTransition(
        { leadId, stageId: targetStage.id, stageType: targetStage.stageType },
        snapshot,
      );
    },
    [columns, localLeads, applyOptimisticMove, runTransition],
  );

  const confirmProposal = useCallback(
    async (capture: ProposalCapture) => {
      if (!pendingProposal) return;
      const { leadId, stage } = pendingProposal;
      // localLeads already reflects the optimistic move; rebuild a rollback snapshot
      // that restores the lead to its server-side stage.
      const serverLead = leads.find((l) => l.id === leadId);
      const snapshot = localLeads.map((l) =>
        l.id === leadId && serverLead ? { ...l, data: { ...serverLead.data } } : l,
      );
      setPendingProposal(null);
      await runTransition(
        {
          leadId,
          stageId: stage.id,
          stageType: stage.stageType,
          amount: capture.amount,
          currency: capture.currency,
          winProbability: capture.winProbability,
        },
        snapshot,
      );
    },
    [pendingProposal, leads, localLeads, runTransition],
  );

  const cancelProposal = useCallback(() => {
    if (!pendingProposal) return;
    // Roll the optimistic move back to the server stage.
    setLocalLeads(leads.map((l) => ({ ...l, data: { ...l.data } })));
    setPendingProposal(null);
  }, [pendingProposal, leads]);

  return {
    loading,
    error,
    pipelines,
    stages,
    activePipelineId,
    setActivePipelineId,
    columns,
    leadsByStage,
    activeLead,
    leadsTableId,
    leadsSchema,
    pendingProposal,
    handleDragStart,
    handleDragEnd,
    confirmProposal,
    cancelProposal,
    reload,
  };
}
