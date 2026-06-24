'use client';

import { useCallback } from 'react';
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

export type { PipelineColumn, ProposalCapture } from './usePipelineBoard';

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
  /** Flat lookup of ALL (unfiltered) opportunities by id — modal resolution survives owner filter. */
  oppById: Map<string, CrmRecord>;
  activeOpportunity: CrmRecord | null;
  /** Owner ("vendedor") filter — options + selection, applied to the board. */
  ownerOptions: OwnerOption[];
  selectedOwnerId: string;
  setSelectedOwnerId: (id: string) => void;
  showOwnerFilter: boolean;
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
 * Board state for the first-class Opportunity pipeline. Thin wrapper over
 * `usePipelineBoard` (shared Kanban mechanics) wired to
 * `CrmService.advanceOpportunity` and the opportunities data slice from
 * `useCrmData`. Re-labels generic outputs to opp-domain names so
 * `OppPipelineBoard` needs zero changes. Degrades gracefully with `notInstalled`
 * when the `crmOpportunities` table is absent.
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

  const advance = useCallback(
    (args: PipelineAdvanceArgs) =>
      CrmService.advanceOpportunity({
        opportunityId: args.recordId,
        stageId: args.stageId,
        stageType: args.stageType,
        amount: args.amount,
        currency: args.currency,
        winProbability: args.winProbability,
      }),
    [],
  );

  const board = usePipelineBoard({
    records: opportunities,
    recordsTableId: opportunitiesTableId,
    stages,
    pipelines,
    loading,
    error,
    reload,
    advance,
    logLabel: 'OppPipelineBoard',
  });

  const pendingProposal = board.pending
    ? { opportunityId: board.pending.recordId, stage: board.pending.stage }
    : null;

  return {
    loading: board.loading,
    error: board.error,
    notInstalled: !loading && !opportunitiesInstalled,
    pipelines: board.pipelines,
    stages: board.stages,
    activePipelineId: board.activePipelineId,
    setActivePipelineId: board.setActivePipelineId,
    columns: board.columns,
    opportunitiesByStage: board.recordsByStage,
    oppById: board.recordById,
    activeOpportunity: board.activeRecord,
    ownerOptions: board.ownerOptions,
    selectedOwnerId: board.selectedOwnerId,
    setSelectedOwnerId: board.setSelectedOwnerId,
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
