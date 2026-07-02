import { useCallback, useEffect, useState } from 'react';
import { FiChevronDown, FiChevronRight, FiRotateCcw } from 'react-icons/fi';
import {
  accountingService,
  type JournalEntryWithFullPostings,
} from '../../../lib/services/accounting.service';
import { Modal } from '../../../components/ui/Modal';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

// ── sub-components ────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  entry: JournalEntryWithFullPostings;
}

function StatusBadge({ entry }: StatusBadgeProps) {
  if (entry.reversedById) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-700/60 px-2 py-0.5 text-xs font-medium text-neutral-300">
        Estornado
      </span>
    );
  }
  if (entry.status === 'Reversed') {
    // Catch Reversed status without reversedById set (defensive)
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-700/60 px-2 py-0.5 text-xs font-medium text-neutral-300">
        Estornado
      </span>
    );
  }
  // Detect whether this entry is itself a reversal: sourceType === 'Reversal'
  if (entry.sourceType === 'Reversal') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-300">
        Estorno
      </span>
    );
  }

  const STATUS_LABEL: Record<string, string> = {
    Draft: 'Rascunho',
    Posted: 'Postado',
    Reconciled: 'Conciliado',
    Reversed: 'Estornado',
  };

  const STATUS_CLASS: Record<string, string> = {
    Draft: 'bg-neutral-700/50 text-neutral-400',
    Posted: 'bg-emerald-900/40 text-emerald-300',
    Reconciled: 'bg-blue-900/40 text-blue-300',
    Reversed: 'bg-neutral-700/60 text-neutral-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[entry.status] ?? 'bg-neutral-700/50 text-neutral-400'}`}
    >
      {STATUS_LABEL[entry.status] ?? entry.status}
    </span>
  );
}

// ── PostingsDrawer ────────────────────────────────────────────────────────────

interface PostingsDrawerProps {
  entry: JournalEntryWithFullPostings;
}

function PostingsDrawer({ entry }: PostingsDrawerProps) {
  return (
    <tr>
      <td colSpan={8} className="bg-neutral-950/60 px-6 pb-3 pt-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-4 font-medium">Conta</th>
              <th className="py-1 pr-4 text-right font-medium">Débito</th>
              <th className="py-1 text-right font-medium">Crédito</th>
            </tr>
          </thead>
          <tbody>
            {entry.postings.map((p) => (
              <tr key={p.id} className="border-t border-neutral-800/50">
                <td className="py-1 pr-4 text-neutral-300">
                  <span className="font-mono text-neutral-500">{p.account.code}</span>
                  {' — '}
                  {p.account.name}
                </td>
                <td className="py-1 pr-4 text-right tabular-nums text-neutral-300">
                  {p.debitCents ? formatCents(p.debitCents) : '—'}
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-300">
                  {p.creditCents ? formatCents(p.creditCents) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ── JournalEntryRow ───────────────────────────────────────────────────────────

interface JournalEntryRowProps {
  entry: JournalEntryWithFullPostings;
  onReverseClick: (id: string) => void;
}

function JournalEntryRow({ entry, onReverseClick }: JournalEntryRowProps) {
  const [expanded, setExpanded] = useState(false);

  const totalDebitCents = entry.postings.reduce((s, p) => s + p.debitCents, 0);
  const totalCreditCents = entry.postings.reduce((s, p) => s + p.creditCents, 0);
  const canReverse = !entry.reversedById && entry.status !== 'Reversed';

  return (
    <>
      <tr
        className="cursor-pointer border-b border-neutral-800/60 transition-colors hover:bg-neutral-800/30 last:border-0"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* expand icon */}
        <td className="w-8 px-3 py-2.5 text-neutral-500">
          {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-neutral-500">
          {entry.fiscalYear && entry.entryNumber != null
            ? `${entry.fiscalYear}/${String(entry.entryNumber).padStart(4, '0')}`
            : '—'}
        </td>
        <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatDate(entry.date)}</td>
        <td className="max-w-xs px-4 py-2.5 text-neutral-100">
          <span className="line-clamp-1">{entry.description}</span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
          {totalDebitCents ? formatCents(totalDebitCents) : '—'}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
          {totalCreditCents ? formatCents(totalCreditCents) : '—'}
        </td>
        <td className="px-4 py-2.5">
          <StatusBadge entry={entry} />
        </td>
        <td
          className="px-4 py-2.5"
          onClick={(e) => e.stopPropagation()} // don't toggle expand when clicking action
        >
          <button
            disabled={!canReverse}
            onClick={() => onReverseClick(entry.id)}
            title={canReverse ? 'Estornar este lançamento' : 'Lançamento já estornado'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-red-700 hover:bg-red-900/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-800 disabled:hover:text-neutral-300"
          >
            <FiRotateCcw size={12} />
            Estornar
          </button>
        </td>
      </tr>
      {expanded && <PostingsDrawer entry={entry} />}
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface JournalEntriesPanelProps {
  unitId: string;
  onReversalComplete?: () => void;
  /** Navigate to the Períodos tab (used in PERIOD_NOT_OPEN error message). */
  onNavigateToPeriods?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * JournalEntriesPanel — paginated list of double-entry journal entries for a
 * given business unit. Each row is expandable to show its individual postings.
 * Supports reversal (estorno) with a confirmation modal.
 */
export function JournalEntriesPanel({ unitId, onReversalComplete, onNavigateToPeriods }: JournalEntriesPanelProps) {
  const [entries, setEntries] = useState<JournalEntryWithFullPostings[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState(false);
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null);
  const [reversalDate, setReversalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isReversing, setIsReversing] = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await accountingService.listEntries({ unitId });
      setEntries(result.entries);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar lançamentos.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  // ── reverse ────────────────────────────────────────────────────────────────
  const confirmEntry = confirmReverseId
    ? entries.find((e) => e.id === confirmReverseId)
    : null;

  const handleConfirmReverse = async () => {
    if (!confirmReverseId || !confirmEntry) return;
    setIsReversing(true);
    setError(null);
    setPeriodError(false);
    try {
      await accountingService.reverseEntry({ unitId, lancamentoId: confirmReverseId, reversalPostingDate: reversalDate });
      setConfirmReverseId(null);
      await fetchEntries();
      onReversalComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao estornar lançamento.';
      // Detect ACCOUNTING_PERIOD_NOT_OPEN to show inline guidance
      if (msg.includes('ACCOUNTING_PERIOD_NOT_OPEN') || msg.includes('período') && msg.includes('fechado')) {
        setPeriodError(true);
      }
      setError(msg);
    } finally {
      setIsReversing(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-neutral-400">Carregando lançamentos…</div>
      )}

      {/* Empty */}
      {!loading && entries.length === 0 && !error && (
        <div className="py-16 text-center text-neutral-500">
          Nenhum lançamento postado nesta unidade ainda.
        </div>
      )}

      {/* Table */}
      {!loading && entries.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="w-8 px-3 py-3" aria-label="Expandir" />
                <th className="px-4 py-3 font-medium">Nº</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 text-right font-medium">Débitos</th>
                <th className="px-4 py-3 text-right font-medium">Créditos</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <JournalEntryRow
                  key={entry.id}
                  entry={entry}
                  onReverseClick={(id) => setConfirmReverseId(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation modal */}
      <Modal
        isOpen={!!confirmReverseId}
        onClose={() => {
          if (!isReversing) { setConfirmReverseId(null); setPeriodError(false); setError(null); }
        }}
        title="Confirmar estorno"
        themeColor="bg-red-600"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => { setConfirmReverseId(null); setPeriodError(false); setError(null); }}
              disabled={isReversing}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleConfirmReverse()}
              disabled={isReversing}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {isReversing ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Estornando…
                </>
              ) : (
                <>
                  <FiRotateCcw size={14} />
                  Confirmar estorno
                </>
              )}
            </button>
          </>
        }
      >
        <div className="px-6 py-5 text-sm text-neutral-300 space-y-4">
          {confirmEntry && (
            <p>
              Estornar lançamento de{' '}
              <span className="font-semibold text-neutral-100">
                {formatDate(confirmEntry.date)}
              </span>{' '}
              —{' '}
              <span className="font-semibold text-neutral-100">
                {confirmEntry.description}
              </span>
              ?
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Data do estorno
            </label>
            <input
              type="date"
              value={reversalDate}
              onChange={(e) => setReversalDate(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-red-500 focus:outline-none"
            />
          </div>
          <p className="text-neutral-400">
            Um novo lançamento oposto será criado automaticamente na data acima. Esta ação não pode ser
            desfeita.
          </p>
          {periodError && onNavigateToPeriods && (
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              O período para a data selecionada está fechado.{' '}
              <button
                type="button"
                onClick={() => { setConfirmReverseId(null); setPeriodError(false); setError(null); onNavigateToPeriods(); }}
                className="underline hover:text-amber-200"
              >
                Ver Períodos
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
