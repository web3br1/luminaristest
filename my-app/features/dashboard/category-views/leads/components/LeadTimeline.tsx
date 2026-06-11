'use client';

import React, { useState } from 'react';
import { getCookie } from 'cookies-next';
import { MonoIcon } from './icons';
import { formatDayLabel } from './utils';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';

interface LeadTimelineProps {
  activities: any[];
  activityFilter: 'all' | 'note' | 'meeting' | 'proposal' | 'stage_change' | 'call' | 'email';
  setActivityFilter: (k: any) => void;
  ownerMap: Record<string, string>;
  stages: any[];
  activitiesTableId?: string | null;
  leadId?: string | null;
  onRefresh?: () => void;
}

export default function LeadTimeline({ activities, activityFilter, setActivityFilter, ownerMap, stages, activitiesTableId, leadId, onRefresh }: LeadTimelineProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteIcon, setNoteIcon] = useState<string>('note');
  const [postingNote, setPostingNote] = useState(false);
  const NOTE_MAX = 1000;
  const [noteRows, setNoteRows] = useState(3);
  const noteMinRows = 3;
  const noteMaxRows = 8;

  function renderRichText(text: string) {
    const parts = text.split(/(#[\w-]+|@[\w.-]+)/g);
    return (
      <>
        {parts.map((p, i) => {
          if (/^#[\w-]+$/.test(p)) return <span key={i} className="text-blue-500 font-bold">{p}</span>;
          if (/^@[\w.-]+$/.test(p)) return <span key={i} className="text-emerald-500 font-bold">{p}</span>;
          return <span key={i}>{p}</span>;
        })}
      </>
    );
  }

  async function createLeadNote() {
    if (!activitiesTableId || !leadId || !noteText.trim()) return;
    try {
      setPostingNote(true);
      const payload = { data: { leadId: String(leadId), type: 'note', message: noteText.trim(), payload: { icon: noteIcon } } };
      await DynamicTableService.createRecord(activitiesTableId, payload);
      setNoteText('');
      setComposerOpen(false);
      onRefresh?.();
    } catch (e: any) {
      // Erro já notificado automaticamente pelo apiClient.
    } finally {
      setPostingNote(false);
    }
  }

  return (
    <section className="bg-white/50 dark:bg-neutral-900/60 backdrop-blur-md rounded-3xl border border-gray-200 dark:border-white/5 p-6 flex-1 min-h-0 flex flex-col h-full shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Linha do Tempo</h3>
        <button
          onClick={() => setComposerOpen(!composerOpen)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          {composerOpen ? 'Cancelar' : 'Nova Atividade'}
        </button>
      </div>

      {composerOpen && (
        <div className="mb-6 bg-white dark:bg-neutral-800 rounded-2xl border border-gray-200 dark:border-white/5 p-4 shadow-xl z-20 animate-in fade-in zoom-in duration-300">
          <div className="flex items-center gap-2 mb-4">
            {['note', 'phone', 'email', 'handshake', 'calendar', 'chat', 'warning'].map((key) => (
              <button
                key={key}
                onClick={() => setNoteIcon(key)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${noteIcon === key ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-neutral-900 text-gray-400 hover:text-gray-900'}`}
              >
                {MonoIcon(key, 'w-4 h-4')}
              </button>
            ))}
          </div>
          <textarea
            value={noteText}
            onChange={(e) => {
              const val = e.target.value.slice(0, NOTE_MAX);
              setNoteText(val);
              const lines = val.split('\n').length;
              setNoteRows(Math.max(noteMinRows, Math.min(noteMaxRows, lines + Math.floor(val.length / 60))));
            }}
            rows={noteRows}
            placeholder="Descreva o que aconteceu... (Dica: Use #faturamento ou @comercial)"
            className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-neutral-950 border border-transparent focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm resize-none mb-3"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{noteText.length}/{NOTE_MAX} caracteres</span>
            <button
              disabled={!noteText.trim() || postingNote}
              onClick={createLeadNote}
              className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {postingNote ? 'Publicando...' : 'Salvar Atividade'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline Filters */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
        {[
          { k: 'all', label: 'Todos', ic: 'M4 6h16M4 12h16M4 18h16' },
          { k: 'note', label: 'Notas', ic: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
          { k: 'meeting', label: 'Eventos', ic: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { k: 'proposal', label: 'Negócios', ic: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
          { k: 'stage_change', label: 'Fluxo', ic: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
        ].map((it: any) => (
          <button
            key={it.k}
            onClick={() => setActivityFilter(it.k as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${activityFilter === it.k ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 border-gray-200 dark:border-white/10 shadow-sm' : 'bg-transparent text-gray-400 border-transparent hover:text-gray-600'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={it.ic} /></svg>
            {it.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        {activities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Nenhuma atividade registrada</span>
          </div>
        ) : (
          <ul className="space-y-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-neutral-800/50">
            {activities.filter((a: any) => activityFilter === 'all' ? true : String((a.data || {}).type || '') === activityFilter).map((a: any, idx: number, arr: any[]) => {
              const ad = a.data || {};
              const when = new Date(a.updatedAt || a.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const type = String(ad.type || '').toLowerCase();
              const colors: any = {
                stage_change: 'bg-indigo-500',
                proposal: 'bg-blue-500',
                meeting: 'bg-emerald-500',
                meeting_no_show: 'bg-rose-500',
                email: 'bg-amber-500',
                note: 'bg-sky-500',
                other: 'bg-slate-400'
              };
              const color = colors[type] || colors.other;

              let title = String(ad.message || '');
              if (type === 'stage_change') {
                const prevName = (stages.find((s: any) => String(s.id) === String(ad?.payload?.prevStage || ad?.prevStageId || ''))?.data || {}).name || 'Início';
                const nextName = (stages.find((s: any) => String(s.id) === String(ad?.payload?.nextStage || ad?.nextStageId || ''))?.data || {}).name || 'Final';
                title = `Transição de etapa: ${prevName} → ${nextName}`;
              }

              const dayLabel = formatDayLabel(String(a.updatedAt || a.createdAt));
              const prevLabel = idx > 0 ? formatDayLabel(String(arr[idx - 1].updatedAt || arr[idx - 1].createdAt)) : '';

              return (
                <React.Fragment key={String(a.id)}>
                  {dayLabel !== prevLabel && (
                    <li className="relative pl-8 pt-4 pb-2 first:pt-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 underline decoration-blue-500 underline-offset-4">{dayLabel}</div>
                    </li>
                  )}
                  <li className="relative pl-8 animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-white dark:border-neutral-900 shadow-sm flex items-center justify-center z-10 ${color}`}>
                      <div className="text-white">
                        {type === 'note' && ad?.payload?.icon ? (
                          ['note', 'phone', 'email', 'handshake', 'calendar', 'chat', 'warning'].includes(String(ad?.payload?.icon))
                            ? MonoIcon(String(ad?.payload?.icon), 'w-3 h-3')
                            : <span className="text-[10px]">{String(ad?.payload?.icon)}</span>
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        )}
                      </div>
                    </div>

                    <div className="group bg-white dark:bg-neutral-800/40 rounded-2xl border border-gray-100 dark:border-white/5 p-4 hover:border-blue-500/20 hover:bg-white dark:hover:bg-neutral-800 transition-all">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                        {type === 'note' ? renderRichText(title) : title}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-gray-400">
                          <span className="text-blue-500">{when}</span>
                          {ad?.actorId && ownerMap[String(ad.actorId)] && <span>• {ownerMap[String(ad.actorId)]}</span>}
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter text-white ${color} grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all`}>
                          {type.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
