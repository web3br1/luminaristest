// React default import: vitest transforms JSX with the classic runtime, needs React in scope.
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { accountingService, type DailyJournalReport, type DailyJournalEntry } from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const inputClass = 'rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none';

function EntryCard({ entry }: { entry: DailyJournalEntry }) {
  const { t } = useTranslation('accounting');
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2.5">
        <div className="text-sm">
          <span className="font-semibold text-neutral-200">{t('dailyJournal.entry.number', 'Lançamento nº {{number}}', { number: entry.entryNumber })}</span>
          <span className="ml-3 text-neutral-500">{formatDate(entry.date)}</span>
          <span className="ml-3 text-neutral-400">{entry.description}</span>
        </div>
        {entry.balanced
          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><FiCheckCircle size={12} /> {t('dailyJournal.balanced', 'Balanceado')}</span>
          : <span className="inline-flex items-center gap-1 text-xs text-red-400"><FiAlertTriangle size={12} /> {t('dailyJournal.unbalanced', 'Desbalanceado')}</span>}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-widest text-neutral-500">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">{t('dailyJournal.columns.account', 'Conta')}</th>
            <th className="px-4 py-2 text-right font-semibold">{t('dailyJournal.columns.debit', 'Débito')}</th>
            <th className="px-4 py-2 text-right font-semibold">{t('dailyJournal.columns.credit', 'Crédito')}</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((l, i) => (
            <tr key={i} className="border-t border-neutral-800/50">
              <td className="px-4 py-1.5 text-neutral-300"><span className="font-mono text-neutral-500">{l.accountCode}</span>{' — '}{l.accountName}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-neutral-200">{l.debitCents ? formatCents(l.debitCents) : ''}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-neutral-200">{l.creditCents ? formatCents(l.creditCents) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DailyJournalPanel({ unitId }: { unitId: string }) {
  const { t } = useTranslation('accounting');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<DailyJournalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    if (!unitId || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await accountingService.getDailyJournal(unitId, from, to));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('dailyJournal.error.load', 'Erro ao carregar o Livro Diário.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('dailyJournal.controls.from', 'De')}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('dailyJournal.controls.to', 'Até')}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </label>
        <button type="button" onClick={() => void loadReport()} disabled={loading || !from || !to} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
          {loading ? t('dailyJournal.controls.calculating', 'Calculando…') : t('dailyJournal.controls.generate', 'Gerar Livro Diário')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!report && !loading && !error && (
        <div className="py-12 text-center text-neutral-500">{t('dailyJournal.empty', 'Selecione o intervalo e clique em "Gerar Livro Diário" para visualizar os lançamentos.')}</div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="text-sm text-neutral-400">{t('dailyJournal.range.label', '{{from}} a {{to}}', { from: formatDate(report.from), to: formatDate(report.to) })}</div>
          {report.entries.length === 0
            ? <div className="py-8 text-center text-sm text-neutral-600">{t('dailyJournal.empty', 'Sem lançamentos no intervalo.')}</div>
            : report.entries.map((e) => <EntryCard key={e.entryNumber} entry={e} />)}
        </div>
      )}
    </div>
  );
}
