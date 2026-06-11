'use client';

import React from 'react';
import { renderBantIcon } from './utils';

interface LeadInfoSidebarProps {
  data: any;
}

export function ContactItem({ icon, label, value }: { icon: string, label: string, value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</div>
      <div className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{value}</span>
      </div>
    </div>
  );
}

export default function LeadInfoSidebar({ data: d }: LeadInfoSidebarProps) {
  return (
    <aside className="bg-white/50 dark:bg-neutral-900/60 backdrop-blur-md rounded-3xl border border-gray-200 dark:border-white/5 p-6 space-y-8 h-full flex flex-col shadow-sm">

      {/* Contact Section */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Perfil do Lead</h3>
        </div>

        <ContactItem label="Email de Contato" icon="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" value={String(d.email || '—')} />
        <ContactItem label="WhatsApp / Telefone" icon="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" value={String(d.phone || '—')} />
        <ContactItem label="Origem da Captura" icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" value={String(d.source || 'Lead Direto')} />
      </div>

      {/* BANT Section */}
      <div className="space-y-5 bg-gray-50/50 dark:bg-white/[0.02] p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-inner">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Qualificação BANT</h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {[
            { label: 'Orçamento', key: 'bantBudget', type: 'budget' },
            { label: 'Autoridade', key: 'bantAuthority', type: 'authority' },
            { label: 'Necessidade', key: 'bantNeed', type: 'need' },
            { label: 'Timing', key: 'bantTiming', type: 'timing' }
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</span>
              <div className="scale-90 origin-right">
                {renderBantIcon(String(d[item.key] || ''), item.type as any)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Proposal Summary */}
      <div className="space-y-5 flex-1 min-h-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Proposta Ativa</h3>
        </div>

        <div className="space-y-4">
          <ContactItem label="Valor Negociado" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" value={d.latestProposalAmount != null ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: String(d.latestProposalCurrency || 'BRL') }).format(d.latestProposalAmount)}` : 'Preço sob consulta'} />

          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Probabilidade de Fechamento</div>
            <div className="w-full bg-gray-200 dark:bg-neutral-800 h-2 rounded-full overflow-hidden shadow-inner flex">
              <div
                className={`h-full transition-all duration-1000 ${Number(d.latestProposalWinProbability) >= 70 ? 'bg-emerald-500' : Number(d.latestProposalWinProbability) >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${d.latestProposalWinProbability || 0}%` }}
              />
            </div>
            <div className="text-[10px] font-black italic text-right text-gray-500">{d.latestProposalWinProbability || 0}% de chance</div>
          </div>

          <ContactItem label="Previsão de Encerramento" icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" value={d.latestProposalEtaClose ? new Date(d.latestProposalEtaClose).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Indefinida'} />
        </div>
      </div>

    </aside>
  );
}
