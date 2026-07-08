import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiCheckCircle, FiAlertTriangle, FiXCircle } from 'react-icons/fi';
import { accountingService, type BalanceSheetReport, type StatementSection } from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SectionTable({ section, title }: { section: StatementSection; title: string }) {
  const { t } = useTranslation('accounting');
  const total = parseInt(section.totalCents, 10);
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <div className="border-b border-neutral-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {section.accounts.map((row) => (
            <tr key={row.accountId} className="border-b border-neutral-800/50 last:border-0">
              <td className="px-4 py-2 text-neutral-300">
                <span className="font-mono text-neutral-500">{row.code}</span>
                {' — '}
                {row.name}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-200">
                {formatCents(parseInt(row.amountCents, 10))}
              </td>
            </tr>
          ))}
          {section.accounts.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-3 text-center text-xs text-neutral-600">
                {t('balanceSheet.section.empty', 'Sem contas com saldo')}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-700 bg-neutral-900/80">
            <td className="px-4 py-2.5 text-xs font-semibold text-neutral-400">{t('balanceSheet.section.total', 'Total')}</td>
            <td className={`px-4 py-2.5 text-right tabular-nums font-bold text-sm ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCents(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface Props {
  unitId: string;
}

export function BalanceSheetPanel({ unitId }: Props) {
  const { t } = useTranslation('accounting');
  const [asOf, setAsOf] = useState(today());
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    if (!unitId || !asOf) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await accountingService.getBalanceSheet(unitId, asOf));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('balanceSheet.error.load', 'Erro ao carregar balanço patrimonial.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const status = report?.reportStatus;
  const dreNet = report ? parseInt(report.netResultLine.amountCents, 10) : 0;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('balanceSheet.controls.asOf', 'Posição em')}</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={loading || !asOf}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? t('balanceSheet.controls.calculating', 'Calculando…') : t('balanceSheet.controls.generate', 'Gerar BP')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="py-12 text-center text-neutral-500">
          {t('balanceSheet.empty', 'Selecione a data e clique em "Gerar BP" para visualizar o Balanço Patrimonial.')}
        </div>
      )}

      {report && (
        <div className="space-y-5">
          {/* Header: period + status */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-400">
              {t('balanceSheet.header.asOf', 'Posição em')} <span className="text-neutral-200">{formatDate(report.asOf)}</span>
              <span className="ml-2 text-xs text-neutral-600">({report.periodSemantics})</span>
            </span>
            <ReportStatusBadge status={status!} mappingVersion={report.mappingVersion} />
            {report.balanced
              ? <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400"><FiCheckCircle size={13} /> {t('balanceSheet.balanced', 'Balanceado')}</span>
              : <span className="inline-flex items-center gap-1.5 text-xs text-red-400"><FiXCircle size={13} /> {t('balanceSheet.unbalanced', 'Desbalanceado')}</span>
            }
          </div>

          {/* Diagnostics banners */}
          <DiagnosticsBanner report={report} />

          {/* Sections */}
          <SectionTable section={report.assets} title={t('balanceSheet.section.assets', 'Ativo')} />
          <SectionTable section={report.liabilities} title={t('balanceSheet.section.liabilities', 'Passivo')} />
          <SectionTable section={report.equity} title={t('balanceSheet.section.equity', 'Patrimônio Líquido')} />

          {/* Net result line */}
          <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900/60 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-200">{t('balanceSheet.netResult.title', 'Resultado do Exercício')}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {t('balanceSheet.netResult.range', '{{from}} a {{to}}', {
                  from: formatDate(report.netResultLine.fromDate),
                  to: formatDate(report.netResultLine.toDate),
                })}
                {' · '}{t('balanceSheet.netResult.calculated', 'calculado')}
              </p>
            </div>
            <span className={`tabular-nums font-bold text-sm ${dreNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCents(dreNet)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportStatusBadge({ status, mappingVersion }: { status: 'OK' | 'WARNING' | 'INVALID'; mappingVersion: string }) {
  const { t } = useTranslation('accounting');
  const cfg = {
    OK:      { label: t('balanceSheet.status.ok', 'OK'),            cls: 'bg-emerald-900/40 text-emerald-300' },
    WARNING: { label: t('balanceSheet.status.warning', 'Aviso'),    cls: 'bg-amber-900/40 text-amber-300' },
    INVALID: { label: t('balanceSheet.status.invalid', 'Inválido'), cls: 'bg-red-900/40 text-red-300' },
  }[status];
  return (
    <span title={t('balanceSheet.status.mappingVersion', 'Versão de mapeamento: {{version}}', { version: mappingVersion })}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {status === 'WARNING' && <FiAlertTriangle size={11} />}
      {status === 'INVALID' && <FiXCircle size={11} />}
      {cfg.label}
    </span>
  );
}

function DiagnosticsBanner({ report }: { report: BalanceSheetReport }) {
  const { t } = useTranslation('accounting');
  const { diagnostics, reportStatus } = report;

  if (reportStatus === 'OK') return null;

  return (
    <div className="space-y-2">
      {reportStatus === 'INVALID' && diagnostics.unmappedAccounts.length > 0 && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <p className="font-semibold mb-1">{t('balanceSheet.diagnostics.unmappedTitle', 'Contas sem mapeamento com saldo:')}</p>
          {diagnostics.unmappedAccounts.map((a) => (
            <div key={a.accountId} className="text-xs">
              {a.code} — {a.name} ({formatCents(a.balanceCents)})
            </div>
          ))}
        </div>
      )}
      {diagnostics.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          {diagnostics.hasUnclosedPriorYearResult && (
            <p>{t('balanceSheet.diagnostics.unclosedPriorYear', 'Resultado do exercício anterior não encerrado ({{amount}})', { amount: formatCents(diagnostics.priorYearResultCents) })}</p>
          )}
          {diagnostics.warnings.filter((w) => !w.includes('prior')).map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
