import { useState } from 'react';
import { FiAlertTriangle, FiXCircle } from 'react-icons/fi';
import { accountingService, type IncomeStatementReport, type StatementSection } from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SectionTable({ section, title, subtitle }: { section: StatementSection; title: string; subtitle?: string }) {
  const total = parseInt(section.totalCents, 10);
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <div className="border-b border-neutral-800 px-4 py-2.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">{title}</span>
        {subtitle && <span className="text-xs text-neutral-600">{subtitle}</span>}
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
                Sem contas com saldo
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-700 bg-neutral-900/80">
            <td className="px-4 py-2.5 text-xs font-semibold text-neutral-400">Total</td>
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

export function IncomeStatementPanel({ unitId }: Props) {
  const [asOf, setAsOf] = useState(today());
  const [report, setReport] = useState<IncomeStatementReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    if (!unitId || !asOf) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await accountingService.getIncomeStatement(unitId, asOf));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar DRE.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const net = report ? parseInt(report.netResult.amountCents, 10) : 0;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Até</span>
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
          {loading ? 'Calculando…' : 'Gerar DRE'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="py-12 text-center text-neutral-500">
          Selecione a data e clique em "Gerar DRE" para visualizar a Demonstração do Resultado.
        </div>
      )}

      {report && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-400">
              <span className="text-neutral-200">{formatDate(report.fromDate)}</span>
              {' a '}
              <span className="text-neutral-200">{formatDate(report.toDate)}</span>
              <span className="ml-2 text-xs text-neutral-600">({report.periodSemantics})</span>
            </span>
            <StatusBadge status={report.reportStatus} mappingVersion={report.mappingVersion} />
          </div>

          {/* Diagnostics */}
          {report.reportStatus !== 'OK' && (
            <div className="space-y-2">
              {report.reportStatus === 'INVALID' && report.diagnostics.unmappedAccounts.length > 0 && (
                <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                  <p className="font-semibold mb-1">Contas sem mapeamento com saldo:</p>
                  {report.diagnostics.unmappedAccounts.map((a) => (
                    <div key={a.accountId} className="text-xs">{a.code} — {a.name} ({formatCents(a.balanceCents)})</div>
                  ))}
                </div>
              )}
              {report.diagnostics.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
                  {report.diagnostics.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
            </div>
          )}

          {/* DRE sections */}
          <SectionTable section={report.grossRevenue} title="Receita Bruta" subtitle="3.1" />
          <SectionTable section={report.revenueDeductions} title="(−) Deduções de Receita" subtitle="3.2" />
          <SectionTable section={report.expenses} title="(−) Despesas" />

          {/* Net result */}
          <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900/60 px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-neutral-100">Resultado Líquido do Exercício</p>
              <p className="text-xs text-neutral-500 mt-0.5">calculado — {report.periodSemantics}</p>
            </div>
            <span className={`tabular-nums text-lg font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCents(net)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, mappingVersion }: { status: 'OK' | 'WARNING' | 'INVALID'; mappingVersion: string }) {
  const cfg = {
    OK:      { label: 'OK',      cls: 'bg-emerald-900/40 text-emerald-300' },
    WARNING: { label: 'Aviso',   cls: 'bg-amber-900/40 text-amber-300' },
    INVALID: { label: 'Inválido',cls: 'bg-red-900/40 text-red-300' },
  }[status];
  return (
    <span title={`Versão: ${mappingVersion}`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {status === 'WARNING' && <FiAlertTriangle size={11} />}
      {status === 'INVALID' && <FiXCircle size={11} />}
      {cfg.label}
    </span>
  );
}
