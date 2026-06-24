'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { useLead360 } from '../context/Lead360Context';
import { formatTimestamp, formatDayLabel } from '../lib/dates';

interface LeadTimelinePanelProps {
  leadId: string;
}

// Colored type badges — ported (inlined, not imported) from legacy LeadTimeline.tsx
// so the crm feature stays self-contained and within its layer.
const TYPE_COLORS: Record<string, string> = {
  stage_change: 'bg-indigo-500',
  proposal: 'bg-blue-500',
  meeting: 'bg-emerald-500',
  meeting_no_show: 'bg-rose-500',
  email: 'bg-amber-500',
  note: 'bg-sky-500',
  call: 'bg-violet-500',
  other: 'bg-slate-400',
};

/**
 * Read-only consolidated activity timeline for a single lead, rendered inside the
 * Lead360 modal. Shows ALL `leadActivities` types (stage_change, meeting, proposal,
 * meeting_no_show, email, note, call) day-grouped with colored type badges. This is
 * the new-layer analogue of the legacy LeadTimeline island, confined to the crm
 * feature — composer / rich-text / filter chips are intentionally out of scope.
 */
export function LeadTimelinePanel({ leadId }: LeadTimelinePanelProps) {
  const { t } = useTranslation('crm');
  const { loading, error, activities, activitiesTableId, actorName } = useLead360();

  if (loading) {
    return <p className="text-sm font-bold text-gray-400">{t('common.loading', 'Carregando…')}</p>;
  }

  if (error) {
    return <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>;
  }

  if (!activitiesTableId) {
    return <p className="text-sm font-bold text-gray-400">{t('timeline.not_available', 'Linha do tempo não disponível.')}</p>;
  }

  if (activities.length === 0) {
    return <p className="text-sm font-bold text-gray-400">{t('timeline.empty', 'Nenhuma atividade.')}</p>;
  }

  return (
    <ul className="space-y-2">
      {activities.map((a, idx, arr) => {
        const ad = a.data || {};
        const type = String(ad.type || '').toLowerCase();
        const color = TYPE_COLORS[type] || TYPE_COLORS.other;

        let title = String(ad.message || '');
        if (type === 'stage_change') {
          title = title || t('timeline.stage_change', 'Mudança de etapa');
        }

        const dayLabel = formatDayLabel(String(a.createdAt), t);
        const prevLabel = idx > 0 ? formatDayLabel(String(arr[idx - 1].createdAt), t) : '';

        return (
          <React.Fragment key={String(a.id)}>
            {dayLabel !== prevLabel && (
              <li className="pt-3 pb-1 first:pt-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{dayLabel}</div>
              </li>
            )}
            <li className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/5 dark:bg-neutral-900/60">
              <p className="whitespace-pre-wrap text-sm font-bold text-gray-800 dark:text-gray-200">{title}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                  <span>
                    {t('notes.by', 'Por')} {actorName(ad.actorId) || '—'}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{formatTimestamp(a.createdAt)}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter text-white ${color}`}>
                  {type.replace('_', ' ')}
                </span>
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );
}

export default LeadTimelinePanel;
