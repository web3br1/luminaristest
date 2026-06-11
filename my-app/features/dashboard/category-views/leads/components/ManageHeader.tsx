'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';

interface ManageHeaderProps {
  leadData: any;
  ownerName: string;
  activitiesCount: number;
  onOpenOptions: () => void;
}

export default function ManageHeader({ leadData: d, ownerName, activitiesCount, onOpenOptions }: ManageHeaderProps) {
  const { t } = useTranslation(['common', 'database']);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/5 p-6 shadow-sm mb-6">
      {/* Background patterns */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl -ml-24 -mb-24" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-blue-500/20">
            {String(d.leadName || '—')[0]?.toUpperCase() || 'L'}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest">
                {t('database:leads.header.badge_lead', 'Lead')}
              </span>
              {d.status && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${String(d.status) === 'Won' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                  String(d.status) === 'Lost' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                    'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  }`}>
                  {String(d.status)}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight truncate">
              {String(d.leadName || '—')}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                {t('database:leads.header.lead_score', 'Lead Score')}: <span className="text-blue-600 dark:text-blue-400 font-black">{String(d.score ?? 0)}</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {String(d.city || 'São Paulo')}, {String(d.state || 'SP')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 bg-gray-50 dark:bg-neutral-800/40 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
          <div className="hidden sm:flex w-12 h-12 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 dark:from-neutral-700 dark:to-neutral-800 items-center justify-center text-gray-700 dark:text-gray-200 font-black text-sm shadow-inner overflow-hidden">
            {String(ownerName || '')[0]?.toUpperCase() || 'U'}
          </div>
          <div className="text-left">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{t('database:leads.header.owner', 'Responsável')}</div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate max-w-[140px]">{ownerName}</div>
            <button onClick={onOpenOptions} className="mt-1 flex items-center gap-1 text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors uppercase tracking-widest">
              {t('database:leads.header.options', 'Opções do Lead')}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('database:leads.header.last_contact', 'Último Contato'), icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', value: d.lastContactAt ? new Date(d.lastContactAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('database:leads.header.none', 'Nenhum') },
          { label: t('database:leads.header.next_action', 'Próxima Ação'), icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', value: d.nextActionAt ? new Date(d.nextActionAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('database:leads.header.not_scheduled', 'Não agendado') },
          { label: t('database:leads.header.interactions', 'Interações'), icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', value: t('database:leads.header.activities_count', { count: activitiesCount, defaultValue: `${activitiesCount} atividades` }) },
          { label: t('database:leads.header.estimated_value', 'Valor Estimado'), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', value: d.latestProposalAmount != null ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: String(d.latestProposalCurrency || 'BRL') }).format(d.latestProposalAmount)}` : t('database:leads.header.on_request', 'Sob consulta') },
        ].map((item, i) => (
          <div key={i} className="group p-4 rounded-2xl bg-gray-50/50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 hover:bg-white dark:hover:bg-neutral-800 transition-all cursor-default">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-white/5 text-blue-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</span>
            </div>
            <div className="text-sm font-black text-gray-900 dark:text-white truncate">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
