import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiLink } from 'react-icons/fi';
import { Modal } from '../../../components/ui/Modal';
import {
  accountingService,
  type BankStatementLine,
  type RankedSuggestion,
} from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';
import { resolveError } from '../lib/resolveError';


interface ReconciliationMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  line: BankStatementLine | null;
  /** Fired after a match is created — parent refetches pending + ledger. */
  onMatched: () => void;
}

/**
 * ReconciliationMatchModal — ranked suggestions for one UNMATCHED statement line
 * (D6: |Δdays| asc, postingId asc). The user ALWAYS picks; ambiguity (>1 candidate
 * with the same amount) is never auto-committed. Every candidate equals the line's
 * exact cents on the right side (the candidate query enforces it), so a single
 * selection always satisfies the aggregate invariant Σ === |line|.
 */
export function ReconciliationMatchModal({
  isOpen,
  onClose,
  unitId,
  line,
  onMatched,
}: ReconciliationMatchModalProps) {
  const { t } = useTranslation('accounting');
  const [suggestions, setSuggestions] = useState<RankedSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!line) return;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      const result = await accountingService.getLineSuggestions(line.id, unitId);
      setSuggestions(result);
    } catch (e) {
      setError(resolveError(e, t('reconciliation.error.load', 'Erro ao carregar a conciliação.')));
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [line, unitId, t]);

  useEffect(() => {
    if (isOpen && line) void load();
  }, [isOpen, line, load]);

  const handleConfirm = async () => {
    if (!line || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      await accountingService.createMatch({
        unitId,
        statementLineId: line.id,
        postingIds: [selectedId],
      });
      onMatched();
      onClose();
    } catch (e) {
      // D3: a posting already linked (or the entry left Posted) surfaces here as a
      // 4xx — show it instead of letting it fail silently.
      setError(resolveError(e, t('reconciliation.error.generic', 'Ocorreu um erro. Tente novamente.')));
    } finally {
      setSubmitting(false);
    }
  };

  // Side amount that must equal |line| (inflow → posting debit, outflow → credit).
  const isInflow = (line?.amountCents ?? 0) > 0;
  const ambiguous = suggestions.length > 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={t('reconciliation.match.title', 'Conciliar linha')}
      themeColor="bg-blue-600"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {t('reconciliation.match.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || !selectedId}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiLink size={14} />
            {submitting
              ? t('reconciliation.match.confirming', 'Conciliando…')
              : t('reconciliation.match.confirm', 'Conciliar selecionado')}
          </button>
        </>
      }
    >
      <div className="space-y-4 px-6 py-5">
        {/* Line summary */}
        {line && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-neutral-300">
                <span className="tabular-nums text-neutral-400">{formatDate(line.date)}</span>
                {' — '}
                {line.description}
              </span>
              <span
                className={`shrink-0 tabular-nums font-semibold ${isInflow ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {isInflow
                  ? t('reconciliation.match.inflow', 'Entrada')
                  : t('reconciliation.match.outflow', 'Saída')}{' '}
                {formatCents(Math.abs(line.amountCents))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-10 text-center text-sm text-neutral-400">
            {t('reconciliation.match.loading', 'Buscando sugestões…')}
          </div>
        )}

        {!loading && suggestions.length === 0 && !error && (
          <div className="py-10 text-center text-sm text-neutral-500">
            {t(
              'reconciliation.match.empty',
              'Nenhum candidato encontrado (mesmo valor exato, ±3 dias, lançamento Postado). Registre o lançamento e tente novamente, ou ignore a linha.',
            )}
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <>
            {ambiguous && (
              <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                {t(
                  'reconciliation.match.ambiguityHint',
                  'Vários candidatos com o mesmo valor — escolha o correto (não há escolha automática).',
                )}
              </p>
            )}
            <div className="overflow-hidden rounded-2xl border border-neutral-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2">{t('reconciliation.match.col.date', 'Data')}</th>
                    <th className="px-3 py-2">{t('reconciliation.match.col.description', 'Histórico')}</th>
                    <th className="px-3 py-2 text-right">{t('reconciliation.match.col.delta', 'Δ dias')}</th>
                    <th className="px-3 py-2 text-right">{t('reconciliation.match.col.amount', 'Valor')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {suggestions.map(({ posting, deltaDays }) => {
                    const sideAmount = isInflow ? posting.debitCents : posting.creditCents;
                    const selected = selectedId === posting.id;
                    return (
                      <tr
                        key={posting.id}
                        onClick={() => setSelectedId(posting.id)}
                        className={`cursor-pointer transition-colors ${selected ? 'bg-blue-950/30' : 'hover:bg-neutral-800/40'}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="radio"
                            name="reconciliation-suggestion"
                            checked={selected}
                            onChange={() => setSelectedId(posting.id)}
                            className="h-4 w-4 accent-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-neutral-300">{formatDate(posting.entry.date)}</td>
                        <td className="px-3 py-2 text-neutral-200">
                          <span className="line-clamp-1">{posting.entry.description}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{deltaDays}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-200">{formatCents(sideAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
