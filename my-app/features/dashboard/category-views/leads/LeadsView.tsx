'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { getCookie } from 'cookies-next';
import { IDynamicTable, isTableSchema } from '../../components/shared/dynamic-tables.client';
import LeadCreateModal from './LeadCreateModal';
const MeetingsCalendar = dynamic(
  () => import('./components/MeetingsCalendar'),
  { ssr: false, loading: () => <div className="p-4 text-gray-500 dark:text-gray-400">Carregando...</div> }
);
import ManageHeader from './components/ManageHeader';
import LeadInfoSidebar from './components/LeadInfoSidebar';
import LeadTimeline from './components/LeadTimeline';
import KanbanView from './components/KanbanView';
import PipelineProgress from './components/PipelineProgress';
import MeetingStageModal from './components/modals/MeetingStageModal';
import ProposalStageModal from './components/modals/ProposalStageModal';
import NoShowModal from './components/modals/NoShowModal';
import DeleteLeadModals from './components/modals/DeleteLeadModals';
import { useLeadsView } from './hooks/useLeadsView';
import { useTranslation } from 'next-i18next';

interface LeadsViewProps {
  tables: IDynamicTable[];
}

export default function LeadsView({ tables }: LeadsViewProps) {
  const { t } = useTranslation(['common', 'database']);
  const {
    state: {
      selectedUnitId, setSelectedUnitId,
      activeTab, setActiveTab,
      isCreateOpen, setIsCreateOpen,
      selectedLeadId, setSelectedLeadId,
      filters,
      leadsTableData, leads, refetch,
      filteredLeads,
      unitOptions,
      pipelines,
      stages,
      activePipelineId, setActivePipelineId,
      ownerMap,
      unitMap,
      activities,
      stageModal: {
        showStageModal, setShowStageModal,
        meetingAt, setMeetingAt,
        propAmountInput, setPropAmountInput,
        propAmountValue, setPropAmountValue,
        propCurrency, setPropCurrency,
        propWinProb, setPropWinProb,
        savingStage, setSavingStage,
        pendingNextStage, setPendingNextStage,
      },
      activity: {
        activityFilter, setActivityFilter,
        showNoShowModal, setShowNoShowModal,
        noShowOption, setNoShowOption,
        noShowNewAt, setNoShowNewAt,
      },
      delete: {
        showDeleteStep, setShowDeleteStep,
        deleteConfirmText, setDeleteConfirmText,
      }
    },
    tables: { leads: leadsTable, activities: activitiesTable },
    actions: {
      fetchActivities,
      advanceToNextStage,
      deleteLeadCompletely,
    }
  } = useLeadsView(tables);

  function renderHeader() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        {/* Tabs and Actions on the same row for efficiency */}
        {renderTabs()}

        <div className="flex items-center gap-3">
          <div className="relative group">
            <select
              value={selectedUnitId || ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setSelectedUnitId(v);
                if (typeof window !== 'undefined' && v) window.localStorage.setItem('leads:lastUnitId', v);
              }}
              className="pl-10 pr-4 py-2.5 rounded-2xl bg-white/50 dark:bg-neutral-800/50 backdrop-blur-md border border-gray-200 dark:border-white/10 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none min-w-[200px] text-gray-900 dark:text-gray-100"
            >
              <option value="">{t('database:leads.all_units', 'Todas as Unidades')}</option>
              {unitOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
            </select>
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t('database:leads.new_lead', 'Novo Lead')}
          </button>
        </div>
      </div>
    );
  }

  function renderTabs() {
    const baseBtn = 'flex items-center gap-2 px-6 py-3.5 text-[11px] font-black uppercase tracking-widest transition-all relative';
    const activeCls = 'text-blue-600 dark:text-blue-400';
    const inactiveCls = 'text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-gray-200';

    return (
      <div className="flex items-center gap-1 bg-gray-100/50 dark:bg-white/[0.03] p-1 rounded-2xl w-fit backdrop-blur-sm border border-gray-200/50 dark:border-white/5">
        <button
          className={`${baseBtn} ${activeTab === 'kanban' ? activeCls : inactiveCls}`}
          onClick={() => setActiveTab('kanban')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
          {t('database:leads.tabs.kanban', 'Kanban')}
          {activeTab === 'kanban' && <div className="absolute bottom-[-1px] left-6 right-6 h-0.5 bg-blue-600 rounded-full" />}
        </button>

        <button
          className={`${baseBtn} ${activeTab === 'manage' ? activeCls : inactiveCls} ${!selectedLeadId ? 'opacity-30 cursor-not-allowed' : ''}`}
          onClick={() => { if (selectedLeadId) setActiveTab('manage'); }}
          aria-disabled={!selectedLeadId}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          {t('database:leads.tabs.manage', 'Gestão')}
          {activeTab === 'manage' && <div className="absolute bottom-[-1px] left-6 right-6 h-0.5 bg-blue-600 rounded-full" />}
        </button>

        <button
          className={`${baseBtn} ${activeTab === 'meetings' ? activeCls : inactiveCls}`}
          onClick={() => setActiveTab('meetings')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          {t('database:leads.tabs.schedule', 'Agenda')}
          {activeTab === 'meetings' && <div className="absolute bottom-[-1px] left-6 right-6 h-0.5 bg-blue-600 rounded-full" />}
        </button>
      </div>
    );
  }

  function renderContent() {
    if (!selectedUnitId) {
      return (
        <div className="p-6 text-sm text-gray-600 dark:text-gray-300">{t('database:leads.select_unit_placeholder', 'Selecione uma unidade para visualizar o Kanban e gerenciar os leads.')}</div>
      );
    }
    if (activeTab === 'meetings') {
      return (
        <MeetingsCalendar
          selectedUnitId={selectedUnitId}
          activitiesTable={activitiesTable}
          filteredLeads={filteredLeads}
          onOpenLead={(leadId) => { setSelectedLeadId(leadId); setActiveTab('manage'); }}
        />
      );
    }
    if (activeTab === 'kanban') {
      const cols = (stages || [])
        .filter((s) => String((s.data || {}).pipelineId || '') === String(activePipelineId))
        .sort((a, b) => Number((a.data || {}).order || 0) - Number((b.data || {}).order || 0));
      return (
        <KanbanView
          cols={cols}
          filteredLeads={filteredLeads}
          ownerMap={ownerMap}
          selectedUnitId={selectedUnitId}
          hasLeadsSchema={!!leadsTableData}
          onOpenCreate={() => setIsCreateOpen(true)}
          onOpenLead={(id) => { setSelectedLeadId(id); setActiveTab('manage'); }}
          activePipelineId={activePipelineId}
          {...filters}
        />
      );
    }
    // manage
    const current = ((selectedLeadId ? filteredLeads.filter((r) => String(r.id) === selectedLeadId) : filteredLeads) || [])[0];
    if (!current) {
      return (
        <div className="p-6 text-sm text-gray-600 dark:text-gray-300">{t('database:leads.select_lead_placeholder', 'Selecione um lead no Kanban para gerenciar.')}</div>
      );
    }
    const d = current.data || {};
    const ownerName = ownerMap[String((d.assigneeId ?? d.ownerId) || '')] || '—';
    const unitName = unitMap[String(d.unitId || '')] || '—';
    const leadPipelineId = String(d.pipelineId || activePipelineId || '');
    const pipelineStages = (stages || [])
      .filter((s) => String((s.data || {}).pipelineId || '') === leadPipelineId)
      .sort((a, b) => Number((a.data || {}).order || 0) - Number((b.data || {}).order || 0));
    const currentStageId = String(d.stageId || '');
    const currentStageIndex = pipelineStages.findIndex((s) => String(s.id) === currentStageId);
    const nextStage = currentStageIndex >= 0 && currentStageIndex < pipelineStages.length - 1 ? pipelineStages[currentStageIndex + 1] : null;
    const stageProgressLabel = pipelineStages.length > 0 && currentStageIndex >= 0 ? t('database:leads.stage_progress', { current: currentStageIndex + 1, total: pipelineStages.length }) : '';
    return (
      <div className="p-4 md:p-6 lg:p-8 flex-1 min-h-0 h-full flex flex-col">
        <ManageHeader leadData={d} ownerName={ownerName} activitiesCount={activities.length} onOpenOptions={() => setShowDeleteStep(1)} />

        <PipelineProgress
          pipelineStages={pipelineStages}
          currentStageId={currentStageId}
          currentStageIndex={currentStageIndex}
          stageProgressLabel={stageProgressLabel}
          nextStage={nextStage}
          onNoShow={() => setShowNoShowModal(true)}
          onAdvanceNext={() => {
            if (!nextStage) return;
            const nextType = String((nextStage.data || {}).type || '').toLowerCase();
            setPendingNextStage(nextStage);
            if (nextType === 'meeting') { setShowStageModal('meeting'); return; }
            if (nextType === 'proposal') { setShowStageModal('proposal'); return; }
            advanceToNextStage(String(current.id), nextStage);
          }}
        />

        {/* Body com sidebar esquerda e timeline à direita */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 h-full">
          <div className="lg:col-span-4 xl:col-span-3">
            <LeadInfoSidebar data={d} />
          </div>
          <div className="lg:col-span-8 xl:col-span-9">
            <LeadTimeline
              activities={activities}
              activityFilter={activityFilter}
              setActivityFilter={setActivityFilter}
              ownerMap={ownerMap}
              stages={stages}
              activitiesTableId={activitiesTable?.id}
              leadId={String(current.id)}
              onRefresh={() => fetchActivities(String(current.id))}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950 transition-colors p-6">
      {renderHeader()}
      <div className="flex-1 min-h-0 overflow-auto">{renderContent()}</div>

      {isCreateOpen && leadsTableData && isTableSchema(leadsTableData.schema) && (
        <LeadCreateModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} tableId={leadsTable!.id} tableSchema={leadsTableData.schema} selectedUnitId={selectedUnitId} onSuccess={refetch} />
      )}
      {/* Stage modals */}
      <MeetingStageModal
        isOpen={showStageModal === 'meeting' && !!pendingNextStage && !!selectedLeadId}
        meetingAt={meetingAt}
        setMeetingAt={setMeetingAt}
        saving={savingStage}
        onCancel={() => setShowStageModal(null)}
        onConfirm={() => advanceToNextStage(String(selectedLeadId), pendingNextStage!, { meetingAt })}
      />
      <NoShowModal
        isOpen={showNoShowModal && !!selectedLeadId}
        option={noShowOption}
        setOption={setNoShowOption}
        newDate={noShowNewAt}
        setNewDate={setNoShowNewAt}
        onCancel={() => setShowNoShowModal(false)}
        onConfirmReschedule={async () => {
          try {
            if (!noShowNewAt) return;
            const token = getCookie('auth_token');
            const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
            if (activitiesTable?.id) {
              await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dynamic-tables/${activitiesTable.id}/data`, { method: 'POST', headers, body: JSON.stringify({ data: { leadId: String(selectedLeadId), type: 'meeting_no_show', message: 'Não compareceu à reunião', payload: { scheduledAt: noShowNewAt } } }) });
              await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dynamic-tables/${activitiesTable.id}/data`, { method: 'POST', headers, body: JSON.stringify({ data: { leadId: String(selectedLeadId), type: 'meeting', message: 'Reunião reagendada', payload: { when: noShowNewAt } } }) });
            }
            if (leadsTable?.id) {
              await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dynamic-tables/${leadsTable.id}/data/${selectedLeadId}`, { method: 'PUT', headers, body: JSON.stringify({ data: { nextActionAt: noShowNewAt } }) });
            }
            await refetch(); await fetchActivities(String(selectedLeadId)); setShowNoShowModal(false); setNoShowNewAt('');
          } catch (e) { /* Erro já notificado automaticamente pelo apiClient. */ }
        }}
        onConfirmBack={async () => {
          try {
            const token = getCookie('auth_token');
            const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
            const lead = (filteredLeads || []).find((l) => String(l.id) === String(selectedLeadId));
            const ld = (lead?.data || {}) as Record<string, unknown>;
            const leadPipelineId2 = String(ld.pipelineId || '');
            const list = (stages || []).filter((s) => String((s.data || {}).pipelineId || '') === leadPipelineId2).sort((a, b) => Number((a.data || {}).order || 0) - Number((b.data || {}).order || 0));
            const idx = list.findIndex((s) => String(s.id) === String(ld.stageId || ''));
            const prev = idx > 0 ? list[idx - 1] : null;
            if (prev && leadsTable?.id) {
              await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dynamic-tables/${leadsTable.id}/data/${selectedLeadId}`, { method: 'PUT', headers, body: JSON.stringify({ data: { stageId: String(prev.id), noShow: true } }) });
            }
            await refetch(); await fetchActivities(String(selectedLeadId)); setShowNoShowModal(false);
          } catch (e) { /* Erro já notificado automaticamente pelo apiClient. */ }
        }}
      />
      <DeleteLeadModals
        step={showDeleteStep}
        onClose={() => setShowDeleteStep(0)}
        onContinue={() => setShowDeleteStep(2)}
        onConfirmDelete={async () => {
          await deleteLeadCompletely(String(selectedLeadId));
          setShowDeleteStep(0); setDeleteConfirmText('');
        }}
        confirmText={deleteConfirmText}
        setConfirmText={setDeleteConfirmText}
        leadName={String(((filteredLeads.find((L) => String(L.id) === String(selectedLeadId))?.data || {}).leadName) || '')}
      />
      <ProposalStageModal
        isOpen={showStageModal === 'proposal' && !!pendingNextStage && !!selectedLeadId}
        amountInput={propAmountInput}
        setAmountInput={setPropAmountInput}
        setAmountValue={setPropAmountValue}
        currency={propCurrency}
        setCurrency={setPropCurrency}
        winProb={propWinProb}
        setWinProb={setPropWinProb}
        saving={savingStage}
        canConfirm={!!propAmountValue}
        onCancel={() => setShowStageModal(null)}
        onConfirm={() => advanceToNextStage(String(selectedLeadId), pendingNextStage!, { amount: Number(propAmountValue), currency: propCurrency, winProbability: propWinProb ? Number(propWinProb) : undefined })}
      />
    </div>
  );
}
