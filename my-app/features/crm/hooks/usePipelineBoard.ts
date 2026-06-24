'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import type { ITableSchema } from '../../dashboard/components/shared/dynamic-tables.client';
import { type CrmRecord } from './useCrmData';
import { useOwnerFilter, type OwnerOption } from './useOwnerFilter';

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

/** Generic atomic-transition payload — the wrapper maps `recordId` to its id key. */
export interface PipelineAdvanceArgs {
  recordId: string;
  stageId: string;
  stageType: string;
  amount?: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  winProbability?: number;
}

/** Pending transition awaiting proposal-capture input from the board modal. */
export interface PendingTransition {
  recordId: string;
  stage: PipelineColumn;
}

export interface PipelineBoardConfig {
  /** Server records (leads or opportunities) from useCrmData. */
  records: CrmRecord[];
  /** The records' table id — schema is resolved from it (owner filter + create form). */
  recordsTableId: string | null;
  stages: CrmRecord[];
  pipelines: CrmRecord[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** The atomic transition (CrmService.advanceStage / advanceOpportunity). */
  advance: (args: PipelineAdvanceArgs) => Promise<unknown>;
  /** Console label for transition failures. */
  logLabel: string;
  /** Optional extra grouping filter (e.g. lead name search). */
  recordFilter?: (r: CrmRecord) => boolean;
}

export interface PipelineBoardState {
  loading: boolean;
  error: string | null;
  pipelines: CrmRecord[];
  stages: CrmRecord[];
  schema: ITableSchema | null;
  recordsTableId: string | null;
  activePipelineId: string | null;
  setActivePipelineId: (id: string) => void;
  columns: PipelineColumn[];
  recordsByStage: Map<string, CrmRecord[]>;
  recordById: Map<string, CrmRecord>;
  activeRecord: CrmRecord | null;
  ownerOptions: OwnerOption[];
  selectedOwnerId: string;
  setSelectedOwnerId: (id: string) => void;
  showOwnerFilter: boolean;
  mine: boolean;
  setMine: (mine: boolean) => void;
  canUseMine: boolean;
  pending: PendingTransition | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  confirmProposal: (capture: ProposalCapture) => Promise<void>;
  cancelProposal: () => void;
  reload: () => Promise<void>;
}

/**
 * Shared Kanban board logic for the CRM pipeline boards (leads + opportunities).
 * Optimistic move + rollback over an atomic `advance` transition, owner filter,
 * proposal-capture deferral. The two boards are first-class-distinct domain
 * objects (Lead vs Opportunity) but share identical board mechanics — this is the
 * single source of that mechanics; the per-entity wrappers (`useCrmPipelineBoard`,
 * `useOppPipelineBoard`) supply the data source + transition and re-label outputs.
 */
export function usePipelineBoard(config: PipelineBoardConfig): PipelineBoardState {
  const { records, recordsTableId, stages, pipelines, loading, error, reload, advance, logLabel, recordFilter } = config;

  const [pipelineOverride, setPipelineOverride] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState<CrmRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<CrmRecord | null>(null);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [schema, setSchema] = useState<ITableSchema | null>(null);

  // Optimistic mirror of the server records (pattern of useKanbanLogic.localTasks).
  useEffect(() => {
    setLocalRecords(records);
  }, [records]);

  // Resolve the records' table schema (owner-filter detection + create form).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!recordsTableId) {
        setSchema(null);
        return;
      }
      try {
        const meta = await DynamicTableService.getTableById(recordsTableId);
        const sch = (meta?.schema ?? null) as ITableSchema | null;
        if (!cancelled) setSchema(sch);
      } catch {
        if (!cancelled) setSchema(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recordsTableId]);

  // Default to the pipeline holding the most records so the board is never empty
  // when several pipelines exist (preserved from the original pipeline.tsx logic).
  const defaultPipelineId = useMemo(() => {
    if (!pipelines.length) return null;
    const counts = new Map<string, number>();
    for (const r of records) {
      const pid = String(r.data?.pipelineId ?? '');
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
  }, [pipelines, records]);

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

  // Owner ("vendedor") filter — auto-detected from the records schema relation.
  const {
    options: ownerOptions,
    selectedOwnerId,
    setSelectedOwnerId,
    hasMultipleOwners,
    mine,
    setMine,
    canUseMine,
    filterByOwner,
  } = useOwnerFilter(schema, records);

  // Apply the owner filter to the optimistic records before grouping into columns.
  const visibleRecords = useMemo(() => filterByOwner(localRecords), [filterByOwner, localRecords]);

  // Flat lookup over the UNFILTERED optimistic records — modal resolution must not
  // be affected when the owner filter hides a record while its detail modal is open.
  const recordById = useMemo(() => {
    const m = new Map<string, CrmRecord>();
    for (const r of localRecords) m.set(r.id, r);
    return m;
  }, [localRecords]);

  const recordsByStage = useMemo(() => {
    const m = new Map<string, CrmRecord[]>();
    for (const r of visibleRecords) {
      if (recordFilter && !recordFilter(r)) continue;
      const sid = String(r.data?.stageId ?? '');
      const bucket = m.get(sid);
      if (bucket) bucket.push(r);
      else m.set(sid, [r]);
    }
    return m;
  }, [visibleRecords, recordFilter]);

  const setActivePipelineId = useCallback((id: string) => setPipelineOverride(id), []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const r = localRecords.find((x) => x.id === String(event.active.id)) ?? null;
      setActiveRecord(r);
    },
    [localRecords],
  );

  // Apply an optimistic stageId move and return the pre-move snapshot for rollback.
  const applyOptimisticMove = useCallback(
    (recordId: string, stageId: string): CrmRecord[] => {
      const snapshot = localRecords.map((r) => ({ ...r, data: { ...r.data } }));
      setLocalRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, data: { ...r.data, stageId } } : r)),
      );
      return snapshot;
    },
    [localRecords],
  );

  // Run the atomic transition; rollback to the snapshot on error (pattern of
  // useKanbanLogic.handleDragEnd, but via the atomic `advance` instead of updateRecord).
  const runTransition = useCallback(
    async (args: PipelineAdvanceArgs, snapshot: CrmRecord[]) => {
      try {
        await advance(args);
        await reload();
      } catch (e) {
        console.error(`[${logLabel}] advance failed`, e);
        setLocalRecords(snapshot);
      }
    },
    [advance, reload, logLabel],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveRecord(null);
      if (!over) return;

      const recordId = String(active.id);
      // closestCenter + sortable cards mean `over.id` can be either a column id OR
      // a record id (when dropping onto a non-empty column). Resolve the target stage
      // from a column id directly, or from the stage that owns the card under cursor.
      const overId = String(over.id);
      const overRecord = localRecords.find((r) => r.id === overId);
      const targetStageId =
        columns.find((c) => c.id === overId)?.id ??
        (overRecord ? String(overRecord.data?.stageId ?? '') : undefined);
      const targetStage = columns.find((c) => c.id === targetStageId);
      if (!targetStage) return; // dropped outside a known column

      const record = localRecords.find((r) => r.id === recordId);
      if (!record || String(record.data?.stageId ?? '') === targetStage.id) return; // no-op

      const snapshot = applyOptimisticMove(recordId, targetStage.id);

      // Proposal stages require extra input — defer the call to the capture modal.
      if (targetStage.stageType === 'proposal') {
        setPending({ recordId, stage: targetStage });
        return;
      }

      void runTransition({ recordId, stageId: targetStage.id, stageType: targetStage.stageType }, snapshot);
    },
    [columns, localRecords, applyOptimisticMove, runTransition],
  );

  const confirmProposal = useCallback(
    async (capture: ProposalCapture) => {
      if (!pending) return;
      const { recordId, stage } = pending;
      // localRecords already reflects the optimistic move; rebuild a rollback snapshot
      // that restores the record to its server-side stage.
      const serverRecord = records.find((r) => r.id === recordId);
      const snapshot = localRecords.map((r) =>
        r.id === recordId && serverRecord ? { ...r, data: { ...serverRecord.data } } : r,
      );
      setPending(null);
      await runTransition(
        {
          recordId,
          stageId: stage.id,
          stageType: stage.stageType,
          amount: capture.amount,
          currency: capture.currency,
          winProbability: capture.winProbability,
        },
        snapshot,
      );
    },
    [pending, records, localRecords, runTransition],
  );

  const cancelProposal = useCallback(() => {
    if (!pending) return;
    // Roll the optimistic move back to the server stage.
    setLocalRecords(records.map((r) => ({ ...r, data: { ...r.data } })));
    setPending(null);
  }, [pending, records]);

  return {
    loading,
    error,
    pipelines,
    stages,
    schema,
    recordsTableId,
    activePipelineId,
    setActivePipelineId,
    columns,
    recordsByStage,
    recordById,
    activeRecord,
    ownerOptions,
    selectedOwnerId,
    setSelectedOwnerId,
    showOwnerFilter: hasMultipleOwners,
    mine,
    setMine,
    canUseMine,
    pending,
    handleDragStart,
    handleDragEnd,
    confirmProposal,
    cancelProposal,
    reload,
  };
}
