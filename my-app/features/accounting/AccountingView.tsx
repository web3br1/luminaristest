import { FiBookOpen, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { useAccountingData } from './hooks/useAccountingData';
import { TrialBalanceTable } from './components/TrialBalanceTable';

/**
 * Accounting workspace — first-class Prisma double-entry module. Picks a business
 * unit (the second tenancy axis) and shows its trial balance (balancete). The
 * audit invariant Σdébito === Σcrédito is surfaced as a badge.
 */
export function AccountingView() {
  const { units, unitId, setUnitId, report, loadingUnits, loadingReport, error } = useAccountingData();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center rounded-2xl bg-emerald-600/15 p-3 text-emerald-400">
            <FiBookOpen size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Contabilidade</h1>
            <p className="text-sm text-neutral-500">Razão de partida dobrada — balancete por unidade</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Unidade</span>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={loadingUnits || units.length === 0}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          >
            {loadingUnits && <option>Carregando…</option>}
            {!loadingUnits && units.length === 0 && <option value="">Nenhuma unidade</option>}
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {report && !loadingReport && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">Balancete</h2>
          {report.balanced ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-medium text-emerald-400">
              <FiCheckCircle size={14} /> Balanceado (Σdébito = Σcrédito)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/15 px-3 py-1 text-xs font-medium text-red-400">
              <FiAlertTriangle size={14} /> Desbalanceado — verifique o razão
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <TrialBalanceTable report={report} loading={loadingReport} />
    </div>
  );
}
