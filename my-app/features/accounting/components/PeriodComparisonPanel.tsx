// React default import: vitest transforms JSX with the classic runtime, needs React in scope.
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { accountingService, type PeriodComparisonReport } from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const inputClass = 'rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none';

export function PeriodComparisonPanel({ unitId }: { unitId: string }) {
  const { t } = useTranslation('accounting');
  const [asOfCurrent, setAsOfCurrent] = useState(today());
  const [asOfPrevious, setAsOfPrevious] = useState('');
  const [report, setReport] = useState<PeriodComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    if (!unitId || !asOfCurrent || !asOfPrevious) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await accountingService.getPeriodComparison(unitId, asOfCurrent, asOfPrevious));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('periodComparison.error.load', 'Erro ao carregar o balancete comparativo.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('periodComparison.controls.current', 'Período atual')}</span>
          <input type="date" value={asOfCurrent} onChange={(e) => setAsOfCurrent(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('periodComparison.controls.previous', 'Período de comparação')}</span>
          <input type="date" value={asOfPrevious} onChange={(e) => setAsOfPrevious(e.target.value)} className={inputClass} />
        </label>
        <button type="button" onClick={() => void loadReport()} disabled={loading || !asOfCurrent || !asOfPrevious} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
          {loading ? t('periodComparison.controls.calculating', 'Calculando…') : t('periodComparison.controls.generate', 'Gerar comparativo')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!report && !loading && !error && (
        <div className="py-12 text-center text-neutral-500">{t('periodComparison.empty', 'Selecione as duas datas e clique em "Gerar comparativo" para visualizar a variação.')}</div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="text-sm text-neutral-400">
            {t('periodComparison.range.label', '{{current}} vs {{previous}}', { current: formatDate(report.asOfCurrent), previous: formatDate(report.asOfPrevious) })}
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-xs uppercase tracking-widest text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">{t('periodComparison.columns.account', 'Conta')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t('periodComparison.columns.current', 'Atual')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t('periodComparison.columns.previous', 'Anterior')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t('periodComparison.columns.deltaAbs', 'Variação')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t('periodComparison.columns.deltaPct', 'Variação %')}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.code} className="border-b border-neutral-800/50 last:border-0">
                    <td className="px-4 py-2 text-neutral-300"><span className="font-mono text-neutral-500">{r.code}</span>{' — '}{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-200">{formatCents(r.current)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-400">{formatCents(r.previous)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${r.deltaAbs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCents(r.deltaAbs)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${r.deltaPct === null ? 'text-neutral-600' : r.deltaPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.deltaPct === null ? t('periodComparison.noBaseline', '—') : `${r.deltaPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-neutral-600">{t('periodComparison.empty', 'Sem dados.')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
