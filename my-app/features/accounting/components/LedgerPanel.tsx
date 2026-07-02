import { useEffect, useState } from 'react';
import { accountingService, type AccountLedgerReport, type Account } from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

interface Props {
  unitId: string;
}

export function LedgerPanel({ unitId }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [ledger, setLedger] = useState<AccountLedgerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chart of accounts for the selector
  useEffect(() => {
    if (!unitId) return;
    accountingService.getAccounts(unitId).then((r) => {
      const active = r.accounts.filter((a) => !a.deletedAt);
      setAccounts(active);
      if (active.length > 0 && !selectedCode) setSelectedCode(active[0].code);
    }).catch(() => setError('Erro ao carregar plano de contas.'));
  }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load ledger when account changes
  useEffect(() => {
    if (!unitId || !selectedCode) return;
    setLoading(true);
    setError(null);
    accountingService.getAccountLedger({ unitId, accountCode: selectedCode })
      .then((r) => setLedger(r))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao carregar razão.'))
      .finally(() => setLoading(false));
  }, [unitId, selectedCode]);

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Conta</span>
          <select
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            disabled={accounts.length === 0}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          >
            {accounts.length === 0 && <option value="">Carregando…</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </select>
        </label>

        {ledger && (
          <span className="text-sm text-neutral-500">
            Saldo final:{' '}
            <span className="tabular-nums text-neutral-200">
              {formatCents(ledger.closingBalanceCents)}
            </span>
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-neutral-400">Carregando razão…</div>
      )}

      {!loading && ledger && ledger.rows.length === 0 && (
        <div className="py-12 text-center text-neutral-500">
          Nenhum lançamento nesta conta.
        </div>
      )}

      {!loading && ledger && ledger.rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Histórico</th>
                <th className="px-4 py-3 text-right font-medium">Débito</th>
                <th className="px-4 py-3 text-right font-medium">Crédito</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((row, i) => (
                <tr
                  key={row.postingId}
                  className={`border-b border-neutral-800/60 last:border-0 ${i % 2 === 0 ? '' : 'bg-neutral-800/20'}`}
                >
                  <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatDate(row.date)}</td>
                  <td className="max-w-xs px-4 py-2.5 text-neutral-100">
                    <span className="line-clamp-1">{row.description}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                    {row.debitCents ? formatCents(row.debitCents) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                    {row.creditCents ? formatCents(row.creditCents) : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                    row.runningBalanceCents >= 0 ? 'text-neutral-100' : 'text-red-400'
                  }`}>
                    {formatCents(row.runningBalanceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-700 bg-neutral-900">
                <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-neutral-300">
                  Saldo final
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-bold ${
                  ledger.closingBalanceCents >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {formatCents(ledger.closingBalanceCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
