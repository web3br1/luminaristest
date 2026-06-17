import React from 'react';
import { useTranslation } from 'next-i18next';
import type { CrmRecord } from '../hooks/useCrmData';
import { DEFAULT_CURRENCY } from '../lib/constants';

interface OpportunityCardProps {
  opportunity: CrmRecord;
  /** id → owner display name, for the "(owner)" line. */
  ownerNames?: Map<string, string>;
  onClick?: (opportunityId: string) => void;
}

/** A pipeline card for a first-class opportunity: name + amount(currency) + win% + owner. */
export function OpportunityCard({ opportunity, ownerNames, onClick }: OpportunityCardProps) {
  const { t } = useTranslation('crm');
  const d = opportunity.data || {};
  const ownerId = String(d.ownerId ?? '');
  const ownerName = ownerId ? ownerNames?.get(ownerId) : undefined;
  const winProbability = d.winProbability != null ? Number(d.winProbability) : null;
  return (
    <button
      type="button"
      onClick={() => onClick?.(opportunity.id)}
      className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-white/5 dark:bg-neutral-800 dark:hover:border-blue-500/40"
    >
      <p className="truncate text-sm font-black text-gray-900 dark:text-white">
        {String(d.name ?? t('opportunities.unnamed', 'Unnamed opportunity'))}
      </p>
      {d.amount != null ? (
        <p className="mt-2 text-xs font-bold text-gray-600 dark:text-gray-300">
          {String(d.currency ?? DEFAULT_CURRENCY)} {Number(d.amount).toLocaleString('pt-BR')}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        {winProbability != null && Number.isFinite(winProbability) ? (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-black text-blue-600 dark:text-blue-400">
            {winProbability}%
          </span>
        ) : (
          <span />
        )}
        {ownerName ? (
          <span className="truncate text-[11px] font-semibold italic text-gray-400">{ownerName}</span>
        ) : null}
      </div>
    </button>
  );
}

export default OpportunityCard;
