import React from 'react';
import type { CrmRecord } from '../hooks/useCrmData';
import { ScoreGauge } from './ui/ScoreGauge';

interface LeadCardProps {
  lead: CrmRecord;
  onClick?: (leadId: string) => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const d = lead.data || {};
  return (
    <button
      type="button"
      onClick={() => onClick?.(lead.id)}
      className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-white/5 dark:bg-neutral-800 dark:hover:border-blue-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-gray-900 dark:text-white">
            {String(d.leadName ?? 'Lead sem nome')}
          </p>
          {d.source ? (
            <p className="truncate text-[11px] font-semibold italic text-gray-400">{String(d.source)}</p>
          ) : null}
          {d.latestProposalAmount != null ? (
            <p className="mt-2 text-xs font-bold text-gray-600 dark:text-gray-300">
              {String(d.latestProposalCurrency ?? 'BRL')} {Number(d.latestProposalAmount).toLocaleString('pt-BR')}
            </p>
          ) : null}
        </div>
        <ScoreGauge score={Number(d.score ?? 0)} size={40} />
      </div>
    </button>
  );
}
