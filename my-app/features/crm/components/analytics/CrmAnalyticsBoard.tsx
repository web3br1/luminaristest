'use client';

import React from 'react';
import { useCrmAnalytics } from '../../hooks/useCrmAnalytics';
import { CrmKpiCard } from '../CrmKpiCard';
import { CrmBarChart } from './CrmBarChart';
import { CrmPieChart } from './CrmPieChart';
import type { CrmDatePreset } from '../../../../lib/services/crm.service';

const PERIODS: { key: CrmDatePreset; label: string }[] = [
  { key: 'thisMonth', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês anterior' },
  { key: 'thisYear', label: 'Este ano' },
];

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

export function CrmAnalyticsBoard() {
  const { datePreset, setDatePreset, data, loading, error } = useCrmAnalytics();
  const card = (n: string) => data.cards.find((c) => c.name === n)?.value ?? 0;
  const newCard = data.cards.find((c) => c.name === 'newLeads');
  const newTone =
    newCard && newCard.previousValue != null
      ? newCard.value >= newCard.previousValue
        ? 'positive'
        : 'negative'
      : 'default';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setDatePreset(p.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              datePreset === p.key
                ? 'bg-blue-600 text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CrmKpiCard label="Total de Leads" value={loading ? '—' : String(card('totalLeads'))} />
        <CrmKpiCard label="Win Rate" value={loading ? '—' : `${card('winRate')}%`} tone={card('winRate') >= 50 ? 'positive' : 'default'} />
        <CrmKpiCard label="Valor do Pipeline" value={loading ? '—' : brl(card('pipelineValue'))} />
        <CrmKpiCard label="Forecast Ponderado" value={loading ? '—' : brl(card('forecast'))} />
        <CrmKpiCard label="Ganhos" value={loading ? '—' : String(card('wonLeads'))} tone="positive" />
        <CrmKpiCard label="Ticket Médio" value={loading ? '—' : brl(card('avgTicket'))} />
        <CrmKpiCard label="Ciclo Médio" value={loading ? '—' : `${card('avgCycleDays')} dias`} />
        <CrmKpiCard
          label="Novos Leads"
          value={loading ? '—' : String(newCard?.value ?? 0)}
          tone={newTone}
          hint={!loading && newCard?.previousValue != null ? `anterior: ${newCard.previousValue}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel title="Funil de conversão"><CrmBarChart data={data.funnel} color="#3b82f6" /></ChartPanel>
        <ChartPanel title="Atribuição por fonte"><CrmPieChart data={data.source} /></ChartPanel>
        <ChartPanel title="Força BANT (% de leads fortes)"><CrmBarChart data={data.bant} color="#14b8a6" formatValue={(v) => `${v}%`} /></ChartPanel>
        <ChartPanel title="Leads por status"><CrmPieChart data={data.status} /></ChartPanel>
        <ChartPanel title="Propostas por status"><CrmBarChart data={data.proposals} multicolor /></ChartPanel>
        <ChartPanel title="Atividades por tipo"><CrmBarChart data={data.activities} multicolor /></ChartPanel>
      </div>
    </div>
  );
}
