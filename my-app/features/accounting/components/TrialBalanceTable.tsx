import { useTranslation } from 'next-i18next';
import type { TrialBalanceReport } from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';

interface TrialBalanceTableProps {
  report: TrialBalanceReport | null;
  loading: boolean;
}

const NATURE_LABEL: Record<string, string> = {
  Asset: 'Ativo',
  Liability: 'Passivo',
  Equity: 'Patrimônio',
  Revenue: 'Receita',
  Expense: 'Despesa',
};

/** Read-only trial balance (balancete): per-account debit/credit/balance in cents. */
export function TrialBalanceTable({ report, loading }: TrialBalanceTableProps) {
  const { t } = useTranslation('accounting');
  if (loading) {
    return <div className="py-16 text-center text-neutral-400">{t('trialBalance.loading', 'Carregando balancete…')}</div>;
  }
  if (!report) {
    return <div className="py-16 text-center text-neutral-500">{t('trialBalance.selectUnit', 'Selecione uma unidade.')}</div>;
  }
  if (report.rows.length === 0) {
    return (
      <div className="py-16 text-center text-neutral-500">
        {t('trialBalance.empty', 'Nenhum lançamento postado nesta unidade ainda.')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-neutral-400">
            <th className="px-4 py-3 font-medium">{t('trialBalance.col.code', 'Código')}</th>
            <th className="px-4 py-3 font-medium">{t('trialBalance.col.account', 'Conta')}</th>
            <th className="px-4 py-3 font-medium">{t('trialBalance.col.nature', 'Natureza')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('trialBalance.col.debit', 'Débito')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('trialBalance.col.credit', 'Crédito')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('trialBalance.col.balance', 'Saldo')}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.accountId} className="border-b border-neutral-800/60 last:border-0">
              <td className="px-4 py-2.5 font-mono text-neutral-300">{row.code}</td>
              <td className="px-4 py-2.5 text-neutral-100">{row.name}</td>
              <td className="px-4 py-2.5 text-neutral-400">{t('trialBalance.nature.' + row.nature, NATURE_LABEL[row.nature] ?? row.nature)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                {row.debitCents ? formatCents(row.debitCents) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                {row.creditCents ? formatCents(row.creditCents) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums text-neutral-100">
                {formatCents(row.balanceCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-700 bg-neutral-900 font-semibold text-neutral-100">
            <td className="px-4 py-3" colSpan={3}>
              {t('trialBalance.total', 'Total')}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCents(report.totals.debitCents)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCents(report.totals.creditCents)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCents(report.totals.balanceCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
