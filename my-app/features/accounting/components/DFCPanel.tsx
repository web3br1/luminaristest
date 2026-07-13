// React default import: vitest transforms JSX with the classic runtime, needs React in scope.
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiCheckCircle, FiAlertTriangle, FiXCircle } from 'react-icons/fi';
import {
  accountingService,
  type CashFlowStatementReport,
  type CashFlowSection,
  type CashFlowLine,
} from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** DFC money is STRING cents (ADR-INCR4) — parse before formatting. */
const cents = (s: string) => formatCents(parseInt(s, 10));

function LineRows({ accounts, emptyLabel }: { accounts: CashFlowLine[]; emptyLabel: string }) {
  if (accounts.length === 0) {
    return (
      <tr>
        <td colSpan={2} className="px-4 py-3 text-center text-xs text-neutral-600">{emptyLabel}</td>
      </tr>
    );
  }
  return (
    <>
      {accounts.map((row) => {
        const v = parseInt(row.amountCents, 10);
        return (
          <tr key={row.accountId} className="border-b border-neutral-800/50 last:border-0">
            <td className="px-4 py-2 text-neutral-300">
              <span className="font-mono text-neutral-500">{row.code}</span>{' — '}{row.name}
            </td>
            <td className={`px-4 py-2 text-right tabular-nums ${v >= 0 ? 'text-neutral-200' : 'text-red-400'}`}>
              {formatCents(v)}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function SimpleSection({ section, title }: { section: CashFlowSection; title: string }) {
  const { t } = useTranslation('accounting');
  const total = parseInt(section.totalCents, 10);
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <div className="border-b border-neutral-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-400">{title}</div>
      <table className="w-full text-sm">
        <tbody><LineRows accounts={section.accounts} emptyLabel={t('cashFlow.section.empty', 'Sem movimentação')} /></tbody>
        <tfoot>
          <tr className="border-t border-neutral-700 bg-neutral-900/80">
            <td className="px-4 py-2.5 text-xs font-semibold text-neutral-400">{t('cashFlow.section.total', 'Total')}</td>
            <td className={`px-4 py-2.5 text-right text-sm font-bold tabular-nums ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCents(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function DFCPanel({ unitId }: { unitId: string }) {
  const { t } = useTranslation('accounting');
  const [asOf, setAsOf] = useState(today());
  const [report, setReport] = useState<CashFlowStatementReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    if (!unitId || !asOf) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await accountingService.getCashFlow(unitId, asOf));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('cashFlow.error.load', 'Erro ao carregar o fluxo de caixa.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const op = report?.operating;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('cashFlow.controls.asOf', 'Posição em')}</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none" />
        </label>
        <button type="button" onClick={() => void loadReport()} disabled={loading || !asOf} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
          {loading ? t('cashFlow.controls.calculating', 'Calculando…') : t('cashFlow.controls.generate', 'Gerar DFC')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!report && !loading && !error && (
        <div className="py-12 text-center text-neutral-500">{t('cashFlow.empty', 'Selecione a data e clique em "Gerar DFC" para visualizar a Demonstração do Fluxo de Caixa.')}</div>
      )}

      {report && op && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-400">
              {formatDate(report.fromDate)} — {formatDate(report.toDate)}
              <span className="ml-2 text-xs text-neutral-600">({t('cashFlow.method.indirect', 'Método indireto')})</span>
            </span>
            <CashFlowStatusBadge status={report.reportStatus} mappingVersion={report.mappingVersion} />
            {report.reconciliation.reconciles
              ? <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400"><FiCheckCircle size={13} /> {t('cashFlow.reconciliation.reconciles', 'Reconcilia')}</span>
              : <span className="inline-flex items-center gap-1.5 text-xs text-red-400"><FiXCircle size={13} /> {t('cashFlow.reconciliation.notReconciles', 'Não reconcilia')}</span>}
          </div>

          {report.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
              {report.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {/* Operating (with net result + adjustments footer rows) */}
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
            <div className="border-b border-neutral-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-400">{t('cashFlow.section.operating', 'Atividades operacionais')}</div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-neutral-800/50">
                  <td className="px-4 py-2 text-neutral-300">{t('cashFlow.operating.netResult', 'Resultado do período')}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-200">{cents(op.netResultCents)}</td>
                </tr>
                <tr className="border-b border-neutral-800/50">
                  <td className="px-4 py-2 text-neutral-400">{t('cashFlow.operating.adjustments', 'Ajustes (capital de giro e não-caixa)')}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-300">{cents(op.adjustmentsCents)}</td>
                </tr>
                <LineRows accounts={op.accounts} emptyLabel={t('cashFlow.section.empty', 'Sem movimentação')} />
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-700 bg-neutral-900/80">
                  <td className="px-4 py-2.5 text-xs font-semibold text-neutral-400">{t('cashFlow.section.total', 'Total')}</td>
                  <td className={`px-4 py-2.5 text-right text-sm font-bold tabular-nums ${parseInt(op.totalCents, 10) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{cents(op.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <SimpleSection section={report.investing} title={t('cashFlow.section.investing', 'Atividades de investimento')} />
          <SimpleSection section={report.financing} title={t('cashFlow.section.financing', 'Atividades de financiamento')} />

          {/* Cash reconciliation */}
          <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900/60 px-4 py-3 text-sm">
            <div className="flex items-center justify-between py-1"><span className="text-neutral-400">{t('cashFlow.cash.opening', 'Caixa inicial')}</span><span className="tabular-nums text-neutral-200">{cents(report.openingCashCents)}</span></div>
            <div className="flex items-center justify-between py-1"><span className="text-neutral-400">{t('cashFlow.reconciliation.sectionsTotal', 'Geração líquida de caixa')}</span><span className="tabular-nums text-neutral-200">{cents(report.reconciliation.sectionsTotalCents)}</span></div>
            <div className="mt-1 flex items-center justify-between border-t border-neutral-700 pt-2 font-semibold"><span className="text-neutral-300">{t('cashFlow.cash.closing', 'Caixa final')}</span><span className={`tabular-nums ${parseInt(report.closingCashCents, 10) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{cents(report.closingCashCents)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function CashFlowStatusBadge({ status, mappingVersion }: { status: 'OK' | 'WARNING' | 'INVALID'; mappingVersion: string }) {
  const { t } = useTranslation('accounting');
  const cfg = {
    OK: { label: t('cashFlow.status.ok', 'OK'), cls: 'bg-emerald-900/40 text-emerald-300' },
    WARNING: { label: t('cashFlow.status.warning', 'Aviso'), cls: 'bg-amber-900/40 text-amber-300' },
    INVALID: { label: t('cashFlow.status.invalid', 'Inválido'), cls: 'bg-red-900/40 text-red-300' },
  }[status];
  return (
    <span title={t('cashFlow.status.mappingVersion', 'Versão de mapeamento: {{version}}', { version: mappingVersion })} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {status === 'WARNING' && <FiAlertTriangle size={11} />}
      {status === 'INVALID' && <FiXCircle size={11} />}
      {cfg.label}
    </span>
  );
}
