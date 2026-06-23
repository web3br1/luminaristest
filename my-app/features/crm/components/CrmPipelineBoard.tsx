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
import FloatingActionButton from '../../dashboard/components/shared/FloatingActionButton';
import { LeadCard } from './LeadCard';
import { Lead360Modal } from './Lead360Modal';
import { ProposalCaptureModal } from './ProposalCaptureModal';
import { useCrmPipelineBoard, type PipelineColumn } from '../hooks/useCrmPipelineBoard';
import { OWNER_FILTER_ALL } from '../hooks/useOwnerFilter';
import type { CrmRecord } from '../hooks/useCrmData';

/** A draggable lead card (mirror of SortableTaskItem/useSortable). */
function SortableLeadCard({ lead, onClick }: { lead: CrmRecord; onClick: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} onClick={onClick} />
    </div>
  );
}

/** A droppable stage column (mirror of KanbanColumn/useDroppable). */
function PipelineColumnView({
  column,
  leads,
  onCardClick,
  emptyLabel,
}: {
  column: PipelineColumn;
  leads: CrmRecord[];
  onCardClick: (id: string) => void;
  emptyLabel: string;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  return (
    <SortableContext id={column.id} items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className="flex h-full flex-col rounded-2xl border border-transparent bg-gray-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30"
      >
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 px-1 pb-3 dark:border-neutral-800/60">
          <span className="text-[11px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-200">
            {column.title}
          </span>
          <span className="min-w-[24px] rounded-full bg-blue-500/10 px-2 py-0.5 text-center text-[11px] font-black text-blue-600 dark:text-blue-400">
            {leads.length}
          </span>
        </div>
        <div className="flex min-h-[400px] flex-grow flex-col gap-3 overflow-y-auto pb-2">
          {leads.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
              {emptyLabel}
            </p>
          ) : (
            leads.map((lead) => <SortableLeadCard key={lead.id} lead={lead} onClick={onCardClick} />)
          )}
        </div>
      </div>
    </SortableContext>
  );
}

/**
 * Interactive CRM pipeline board. Reuses the dnd-kit setup from
 * `InternalKanbanView` (DndContext + PointerSensor 8px + closestCenter +
 * DragOverlay). Columns are the active pipeline's stages; dragging a lead between
 * stages runs the atomic `CrmService.advanceStage` transition (with a proposal
 * capture step when the target stage type is `proposal`). Card click opens the
 * Lead360 modal — never a route change.
 */
export function CrmPipelineBoard() {
  const { t } = useTranslation('crm');
  const {
    loading,
    error,
    pipelines,
    stages,
    activePipelineId,
    setActivePipelineId,
    columns,
    leadsByStage,
    leadById,
    activeLead,
    leadsTableId,
    leadsSchema,
    ownerOptions,
    selectedOwnerId,
    setSelectedOwnerId,
    nameQuery,
    setNameQuery,
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
  } = useCrmPipelineBoard();

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Resolve from the UNFILTERED lead map so changing the owner filter (or filtering
  // a lead out) while the Lead360 modal is open does not abruptly close it.
  const selectedLead = useMemo<CrmRecord | null>(
    () => (selectedLeadId ? leadById.get(selectedLeadId) ?? null : null),
    [selectedLeadId, leadById],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            {t('pipeline.title', 'Pipeline')}
          </h1>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {t('pipeline.subtitle', 'Gestão do funil por etapa')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder={t('pipeline.search_placeholder', 'Buscar por nome…')}
            aria-label={t('pipeline.search_label', 'Buscar lead')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 placeholder:font-semibold placeholder:text-gray-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
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
                  {String(p.data?.name ?? t('pipeline.title', 'Pipeline'))}
                </option>
              ))}
            </select>
          ) : null}
          {leadsTableId && leadsSchema ? (
            <FloatingActionButton
              tableId={leadsTableId}
              tableSchema={leadsSchema}
              onSuccess={reload}
              modalTitle={t('pipeline.new_lead', 'Novo Lead')}
              themeColor="bg-blue-600"
            >
              <span className="text-sm font-bold">{t('pipeline.new_lead', 'Novo Lead')}</span>
            </FloatingActionButton>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : columns.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('pipeline.no_stages', 'Nenhuma etapa configurada.')}</p>
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
                <PipelineColumnView
                  column={column}
                  leads={leadsByStage.get(column.id) ?? []}
                  onCardClick={setSelectedLeadId}
                  emptyLabel={t('pipeline.empty_stage', 'Sem registros')}
                />
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <div className="pointer-events-none relative z-50 rotate-2 opacity-90">
                <LeadCard lead={activeLead} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Lead360Modal
        isOpen={selectedLead !== null}
        onClose={() => setSelectedLeadId(null)}
        lead={selectedLead}
        stages={stages}
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

export default CrmPipelineBoard;
