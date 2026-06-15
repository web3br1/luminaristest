'use client';

import { useTranslation } from 'next-i18next';
import type { IDynamicTableData } from '@/features/dashboard/components/shared/dynamic-tables.client';

interface KanbanViewProps {
  cols: IDynamicTableData[];
  filteredLeads: IDynamicTableData[];
  ownerMap: Record<string, string>;
  selectedUnitId: string | null;
  hasLeadsSchema: boolean;
  onOpenCreate: () => void;
  onOpenLead: (id: string) => void;
  // filters
  filterName: string; setFilterName: (v: string) => void;
  filterSource: string; setFilterSource: (v: string) => void;
  filterScoreMin: string; setFilterScoreMin: (v: string) => void;
  filterScoreMax: string; setFilterScoreMax: (v: string) => void;
  filterBudget: string; setFilterBudget: (v: string) => void;
  filterAuthority: string; setFilterAuthority: (v: string) => void;
  filterNeed: string; setFilterNeed: (v: string) => void;
  filterTiming: string; setFilterTiming: (v: string) => void;
  showFilters: boolean; setShowFilters: (v: boolean) => void;
  activePipelineId: string | null;
}

export default function KanbanView(props: KanbanViewProps) {
  const { t } = useTranslation(['common', 'database']);
  const { cols, filteredLeads, ownerMap, selectedUnitId, hasLeadsSchema, onOpenCreate, onOpenLead } = props;
  const { filterName, setFilterName, filterSource, setFilterSource, filterScoreMin, setFilterScoreMin, filterScoreMax, setFilterScoreMax, filterBudget, setFilterBudget, filterAuthority, setFilterAuthority, filterNeed, setFilterNeed, filterTiming, setFilterTiming, showFilters, setShowFilters } = props;

  const filterTopBar = (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white/50 dark:bg-neutral-800/30 backdrop-blur-md p-4 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm">
      <div className="relative flex-1 max-w-md">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
        </span>
        <input
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          placeholder={t('database:leads.kanban.search_placeholder', 'Buscar leads por nome...')}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-gray-100/50 dark:bg-neutral-900/50 border border-transparent focus:bg-white dark:focus:bg-neutral-900 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all text-gray-900 dark:text-gray-100"
        />
        {filterName && (
          <button onClick={() => setFilterName('')} className="absolute inset-y-0 right-3 text-gray-400 hover:text-gray-600">✕</button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${showFilters ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          {t('filters', 'Filtros')}
        </button>
      </div>
    </div>
  );

  const filterPanel = showFilters ? (
    <div className="mb-6 p-4 rounded-2xl border border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-neutral-900/50 backdrop-blur-md shadow-inner">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input value={filterSource} onChange={(e) => setFilterSource(e.target.value)} placeholder={t('database:fields.source', 'Fonte do Lead')} className="px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/5 text-sm text-gray-900 dark:text-gray-100" />
        <div className="flex items-center gap-2">
          <input type="number" value={filterScoreMin} onChange={(e) => setFilterScoreMin(e.target.value)} placeholder={t('database:leads.filters.score_min', 'Score Min')} className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/5 text-sm text-gray-900 dark:text-gray-100" />
          <input type="number" value={filterScoreMax} onChange={(e) => setFilterScoreMax(e.target.value)} placeholder={t('database:leads.filters.score_max', 'Score Max')} className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/5 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <select value={filterBudget} onChange={(e) => setFilterBudget(e.target.value)} className="px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/5 text-sm text-gray-900 dark:text-gray-100">
          <option value="">{t('database:leads.filters.budget_all', 'Budget: Todos')}</option>
          <option value="Low">{t('options.Low', 'Low')}</option>
          <option value="Medium">{t('options.Medium', 'Medium')}</option>
          <option value="High">{t('options.High', 'High')}</option>
        </select>
        <select value={filterAuthority} onChange={(e) => setFilterAuthority(e.target.value)} className="px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/5 text-sm text-gray-900 dark:text-gray-100">
          <option value="">{t('database:leads.filters.authority_all', 'Autoridade: Todas')}</option>
          <option value="Low">{t('options.Low', 'Low')}</option>
          <option value="Medium">{t('options.Medium', 'Medium')}</option>
          <option value="High">{t('options.High', 'High')}</option>
        </select>
      </div>
    </div>
  ) : null;

  const applyFilters = (arr: IDynamicTableData[]) => arr.filter((r) => {
    const d = r.data || {};
    if (filterName && !String(d.leadName || '').toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterSource && !String(d.source || '').toLowerCase().includes(filterSource.toLowerCase())) return false;
    const sc = Number(d.score || 0);
    if (filterScoreMin && sc < Number(filterScoreMin)) return false;
    if (filterScoreMax && sc > Number(filterScoreMax)) return false;
    if (filterBudget && String(d.bantBudget || '') !== filterBudget) return false;
    if (filterAuthority && String(d.bantAuthority || '') !== filterAuthority) return false;
    if (filterNeed && String(d.bantNeed || '') !== filterNeed) return false;
    if (filterTiming && String(d.bantTiming || '') !== filterTiming) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full w-full bg-transparent">
      {filterTopBar}
      {filterPanel}

      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-bold uppercase tracking-wider">
            {t('database:leads.kanban.total_leads', { count: applyFilters(filteredLeads).length, defaultValue: '{{count}} Leads Totais' })}
          </div>
          <div className="text-xs text-gray-400 dark:text-neutral-500 font-bold uppercase tracking-widest">
            {t('database:leads.kanban.pipeline_stages', { count: cols.length, defaultValue: '{{count}} etapas no pipeline' })}
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 pb-4 custom-scrollbar overflow-x-auto">
        {cols.map((stage) => {
          const sid = String(stage.id);
          const stageLeads = applyFilters(filteredLeads).filter((r) => String((r.data || {}).stageId || '') === sid);
          return (
            <div key={sid} className="flex-1 min-w-[320px] max-w-[450px] flex flex-col h-full bg-gray-100/40 dark:bg-white/[0.02] backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden">
              <div className="p-5 flex justify-between items-center border-b border-gray-200/50 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <h2 className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-widest">{String((stage.data || {}).name || t('database:leads.kanban.stage_fallback', 'Etapa'))}</h2>
                </div>
                <span className="text-[10px] font-bold bg-white dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 rounded-lg px-2 py-1 shadow-sm border border-gray-200 dark:border-white/5">{stageLeads.length}</span>
              </div>

              <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto custom-scrollbar pr-2">
                {stageLeads.map((r) => {
                  const d = r.data || {};
                  const ownerNameCard = props.ownerMap[String((d.assigneeId ?? d.ownerId) || '')] || '—';
                  const score = Number(d.score || 0);
                  const scoreColor = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-gray-400 dark:text-neutral-500';

                  return (
                    <button
                      key={r.id}
                      onClick={() => props.onOpenLead(String(r.id))}
                      className="group w-full text-left bg-white dark:bg-neutral-900/40 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 p-4 shadow-sm hover:shadow-xl hover:border-blue-500/50 hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 transition-colors tracking-tight">{String(d.leadName || '—')}</h3>
                          <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5 font-medium truncate italic">{String(d.source || t('database:leads.kanban.lead_source_fallback', 'Lead Direto'))}</p>
                        </div>

                        <div className="relative flex items-center justify-center w-10 h-10 ml-2">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-100 dark:text-neutral-800 opacity-20" />
                            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray={100} strokeDashoffset={100 - score} className={`${scoreColor} transition-all duration-1000`} />
                          </svg>
                          <span className={`absolute text-[10px] font-black ${scoreColor}`}>{score}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] text-white font-bold uppercase ring-2 ring-white dark:ring-neutral-950 shadow-sm">
                            {ownerNameCard.charAt(0)}
                          </div>
                          <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-300 truncate max-w-[80px]">{ownerNameCard}</span>
                        </div>

                        <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm border ${String(d.bantTiming).toLowerCase() === 'urgent'
                          ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                          : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          }`}>
                          {t(`database:options.${String(d.bantTiming || 'MEDIUM')}`, String(d.bantTiming || 'MEDIUM'))}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {stageLeads.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center opacity-40 grayscale">
                    <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('database:leads.kanban.no_records', 'Sem registros')}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
