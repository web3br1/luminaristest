'use client';

import { useCallback, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { CrmService } from '../../../lib/services/crm.service';
import { useCrmData, type CrmRecord } from './useCrmData';
import {
  usePipelineBoard,
  type PipelineAdvanceArgs,
  type PipelineColumn,
  type ProposalCapture,
} from './usePipelineBoard';
import type { OwnerOption } from './useOwnerFilter';
import type { ITableSchema } from '../../dashboard/components/shared/dynamic-tables.client';

export type { PipelineColumn, ProposalCapture } from './usePipelineBoard';

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
  /** Flat lookup of ALL (unfiltered) leads by id — modal resolution survives owner filter. */
  leadById: Map<string, CrmRecord>;
  activeLead: CrmRecord | null;
  /** Leads table id + schema, for the FloatingActionButton create-lead form. */
  leadsTableId: string | null;
  leadsSchema: ITableSchema | null;
  /** Owner ("vendedor") filter — options + selection, applied to the board. */
  ownerOptions: OwnerOption[];
  selectedOwnerId: string;
  setSelectedOwnerId: (id: string) => void;
  /** Free-text name search ("contains", case-insensitive) over leadName. */
  nameQuery: string;
  setNameQuery: (q: string) => void;
  showOwnerFilter: boolean;
  mine: boolean;
  setMine: (mine: boolean) => void;
  canUseMine: boolean;
  /** Set while a drop targeted a `proposal` stage and awaits amount input. */
  pendingProposal: PendingProposal | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  confirmProposal: (capture: ProposalCapture) => Promise<void>;
  cancelProposal: () => void;
  reload: () => Promise<void>;
}

/**
 * Board state for the CRM leads pipeline. Thin wrapper over `usePipelineBoard`
 * (shared Kanban mechanics) wired to `CrmService.advanceStage` and the leads
 * data slice from `useCrmData`. Re-labels generic outputs to lead-domain names so
 * `CrmPipelineBoard` needs zero changes.
 */
export function useCrmPipelineBoard(): CrmPipelineBoardState {
  const { loading, error, leads, stages, pipelines, leadsTableId, reload } = useCrmData();
  const [nameQuery, setNameQuery] = useState('');

  const advance = useCallback(
    (args: PipelineAdvanceArgs) =>
      CrmService.advanceStage({
        leadId: args.recordId,
        stageId: args.stageId,
        stageType: args.stageType,
        amount: args.amount,
        currency: args.currency,
        winProbability: args.winProbability,
      }),
    [],
  );

  const q = nameQuery.trim().toLowerCase();
  const recordFilter = useCallback(
    (r: CrmRecord) => !q || String(r.data?.leadName ?? '').toLowerCase().includes(q),
    [q],
  );

  const board = usePipelineBoard({
    records: leads,
    recordsTableId: leadsTableId,
    stages,
    pipelines,
    loading,
    error,
    reload,
    advance,
    logLabel: 'CrmPipelineBoard',
    recordFilter,
  });

  const pendingProposal = board.pending
    ? { leadId: board.pending.recordId, stage: board.pending.stage }
    : null;

  return {
    loading: board.loading,
    error: board.error,
    pipelines: board.pipelines,
    stages: board.stages,
    activePipelineId: board.activePipelineId,
    setActivePipelineId: board.setActivePipelineId,
    columns: board.columns,
    leadsByStage: board.recordsByStage,
    leadById: board.recordById,
    activeLead: board.activeRecord,
    leadsTableId: board.recordsTableId,
    leadsSchema: board.schema,
    ownerOptions: board.ownerOptions,
    selectedOwnerId: board.selectedOwnerId,
    setSelectedOwnerId: board.setSelectedOwnerId,
    nameQuery,
    setNameQuery,
    showOwnerFilter: board.showOwnerFilter,
    mine: board.mine,
    setMine: board.setMine,
    canUseMine: board.canUseMine,
    pendingProposal,
    handleDragStart: board.handleDragStart,
    handleDragEnd: board.handleDragEnd,
    confirmProposal: board.confirmProposal,
    cancelProposal: board.cancelProposal,
    reload: board.reload,
  };
}
