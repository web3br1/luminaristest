'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { OpportunityCard } from './OpportunityCard';
import { Opp360Modal } from './Opp360Modal';
import { ProposalCaptureModal } from './ProposalCaptureModal';
import { useOppPipelineBoard, type PipelineColumn } from '../hooks/useOppPipelineBoard';
import { OWNER_FILTER_ALL } from '../hooks/useOwnerFilter';
import type { CrmRecord } from '../hooks/useCrmData';

/** A draggable opportunity card (mirror of SortableLeadCard). */
function SortableOpportunityCard({
  opportunity,
  ownerNames,
  onClick,
}: {
  opportunity: CrmRecord;
  ownerNames: Map<string, string>;
  onClick: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <OpportunityCard opportunity={opportunity} ownerNames={ownerNames} onClick={onClick} />
    </div>
  );
}

/** A droppable stage column (mirror of PipelineColumnView). */
function OppColumnView({
  column,
  opportunities,
  ownerNames,
  onCardClick,
  emptyLabel,
}: {
  column: PipelineColumn;
  opportunities: CrmRecord[];
  ownerNames: Map<string, string>;
  onCardClick: (id: string) => void;
  emptyLabel: string;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  return (
    <SortableContext
      id={column.id}
      items={opportunities.map((o) => o.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className="flex h-full flex-col rounded-2xl border border-transparent bg-gray-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30"
      >
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 px-1 pb-3 dark:border-neutral-800/60">
          <span className="text-[11px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-200">
            {column.title}
          </span>
          <span className="min-w-[24px] rounded-full bg-blue-500/10 px-2 py-0.5 text-center text-[11px] font-black text-blue-600 dark:text-blue-400">
            {opportunities.length}
          </span>
        </div>
        <div className="flex min-h-[400px] flex-grow flex-col gap-3 overflow-y-auto pb-2">
          {opportunities.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
              {emptyLabel}
            </p>
          ) : (
            opportunities.map((opp) => (
              <SortableOpportunityCard
                key={opp.id}
                opportunity={opp}
                ownerNames={ownerNames}
                onClick={onCardClick}
              />
            ))
          )}
        </div>
      </div>
    </SortableContext>
  );
}

/**
 * Interactive Opportunity pipeline board. Mirror of `CrmPipelineBoard` over the
 * first-class `crmOpportunities` table — reuses the same dnd-kit primitives
 * (DndContext + PointerSensor 8px + closestCenter + DragOverlay). Columns are the
 * active pipeline's stages (reused from leadStages); dragging an opportunity runs
 * the atomic `CrmService.advanceOpportunity` transition (with a proposal-capture
 * step when the target stage type is `proposal`, and Won/Lost closing on
 * closed_won/closed_lost). Card click opens the Opp360 modal — never a route. When
 * `crmOpportunities` is not installed, an on-brand empty state is shown.
 */
export function OppPipelineBoard() {
  const { t } = useTranslation('crm');
  const {
    loading,
    error,
    notInstalled,
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
    showOwnerFilter,
    mine,
    setMine,
    canUseMine,
    pendingProposal,
    handleDragStart,
    handleDragEnd,
    confirmProposal,
    cancelProposal,
    reload,
  } = useOppPipelineBoard();

  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // id → owner display name (for the card + Opp360), built from the owner filter options.
  const ownerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of ownerOptions) m.set(o.id, o.name);
    return m;
  }, [ownerOptions]);

  // Resolve from the UNFILTERED opp map so changing the owner filter while the
  // Opp360 modal is open does not abruptly close it.
  const selectedOpp = useMemo<CrmRecord | null>(
    () => (selectedOppId ? oppById.get(selectedOppId) ?? null : null),
    [selectedOppId, oppById],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            {t('opportunities.title', 'Opportunities')}
          </h1>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {t('opportunities.subtitle', 'Gestão de oportunidades por etapa')}
          </p>
        </div>
        {!notInstalled ? (
          <div className="flex items-center gap-3">
            {showOwnerFilter ? (
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                disabled={mine}
                aria-label={t('owner_filter.label', 'Vendedor')}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              >
                <option value={OWNER_FILTER_ALL}>{t('owner_filter.all', 'Todos os vendedores')}</option>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : null}
            {canUseMine ? (
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={mine}
                  onChange={(e) => setMine(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-white/20 dark:bg-neutral-700"
                />
                {t('owner_filter.mine', 'Meus registros')}
              </label>
            ) : null}
            {pipelines.length > 1 ? (
              <select
                value={activePipelineId ?? ''}
                onChange={(e) => setActivePipelineId(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.data?.name ?? t('opportunities.title', 'Opportunities'))}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : notInstalled ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-white/10">
          <p className="text-base font-black text-gray-700 dark:text-gray-200">
            {t('opportunities.not_installed', 'Oportunidades não instaladas')}
          </p>
          <p className="mt-2 max-w-sm text-sm font-semibold text-gray-500 dark:text-gray-400">
            {t('opportunities.not_installed_hint', 'Um administrador pode habilitar o módulo de oportunidades.')}
          </p>
        </div>
      ) : columns.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('pipeline.no_stages', 'Nenhuma etapa configurada.')}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
            {columns.map((column) => (
              <div key={column.id} className="w-72 shrink-0">
                <OppColumnView
                  column={column}
                  opportunities={opportunitiesByStage.get(column.id) ?? []}
                  ownerNames={ownerNames}
                  onCardClick={setSelectedOppId}
                  emptyLabel={t('pipeline.empty_stage', 'Sem registros')}
                />
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeOpportunity ? (
              <div className="pointer-events-none relative z-50 rotate-2 opacity-90">
                <OpportunityCard opportunity={activeOpportunity} ownerNames={ownerNames} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Opp360Modal
        isOpen={selectedOpp !== null}
        onClose={() => setSelectedOppId(null)}
        opportunity={selectedOpp}
        stages={stages}
        ownerNames={ownerNames}
        onChanged={reload}
      />

      <ProposalCaptureModal
        isOpen={pendingProposal !== null}
        stageName={pendingProposal?.stage.title ?? ''}
        onCancel={cancelProposal}
        onConfirm={confirmProposal}
      />
    </div>
  );
}

export default OppPipelineBoard;
