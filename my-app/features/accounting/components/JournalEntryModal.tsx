import { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { parseBrl } from '../lib/parseBrl';
import { formatCents } from '../lib/formatCents';
import { resolveError } from '../lib/resolveError';
import { accountingService } from '../../../lib/services/accounting.service';
import type { DimensionCatalogEntry } from '../../../lib/services/dimensions.service';

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  acceptsEntries: boolean;
}

export interface JournalEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  accounts: AccountOption[];
  onSuccess: () => void;
  /** Active dimension axes + their values (INCR-DIM). Optional per-line tagging; empty = no picker. */
  dimensionCatalog?: DimensionCatalogEntry[];
}

interface Line {
  id: string;
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountBrl: string;
  /** definitionId → valueId (one value per axis by construction). */
  dims: Record<string, string>;
}

/** An axis with only its leaf, active values — the only ones taggable (backend rejects non-leaf). */
interface TaggableAxis {
  definitionId: string;
  code: string;
  name: string;
  leaves: Array<{ id: string; code: string; name: string }>;
}

/**
 * Reduce the catalog to taggable axes: active definitions, each with its ACTIVE LEAF values (a value
 * with no active child). Mirrors PostingService.resolveLineDimensions (leaf-only) so the picker never
 * offers a value the backend would reject.
 */
function toTaggableAxes(catalog: DimensionCatalogEntry[]): TaggableAxis[] {
  return catalog
    .filter((c) => c.definition.status === 'ACTIVE')
    .map((c) => {
      const activeChildOf = new Set(
        c.values.filter((v) => v.status === 'ACTIVE' && v.parentId).map((v) => v.parentId as string),
      );
      const leaves = c.values
        .filter((v) => v.status === 'ACTIVE' && !activeChildOf.has(v.id))
        .map((v) => ({ id: v.id, code: v.code, name: v.name }));
      return { definitionId: c.definition.id, code: c.definition.code, name: c.definition.name, leaves };
    })
    .filter((a) => a.leaves.length > 0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

let nextId = 3;

const DEFAULT_LINES: Line[] = [
  { id: '1', accountCode: '', side: 'DEBIT', amountBrl: '', dims: {} },
  { id: '2', accountCode: '', side: 'CREDIT', amountBrl: '', dims: {} },
];

export function JournalEntryModal({
  isOpen,
  onClose,
  unitId,
  accounts,
  onSuccess,
  dimensionCatalog = [],
}: JournalEntryModalProps) {
  const { t } = useTranslation('accounting');
  const [date, setDate] = useState<string>(today);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>(DEFAULT_LINES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryAccounts = accounts.filter((a) => a.acceptsEntries);
  const taggableAxes = useMemo(() => toTaggableAxes(dimensionCatalog), [dimensionCatalog]);

  // ── Balance computation ──────────────────────────────────────────────────────
  const totalDebit = lines
    .filter((l) => l.side === 'DEBIT')
    .reduce((acc, l) => acc + parseBrl(l.amountBrl), 0);

  const totalCredit = lines
    .filter((l) => l.side === 'CREDIT')
    .reduce((acc, l) => acc + parseBrl(l.amountBrl), 0);

  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

  const isDirty =
    description !== '' ||
    lines.some((l) => l.accountCode !== '' || l.amountBrl !== '');

  // ── Line helpers ─────────────────────────────────────────────────────────────
  function updateLine(id: string, patch: Partial<Omit<Line, 'id'>>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: String(nextId++), accountCode: '', side: 'DEBIT', amountBrl: '', dims: {} },
    ]);
  }

  /** Set (or clear, when valueId is '') the tag for one axis on one line. One value per axis. */
  function setLineDim(lineId: string, definitionId: string, valueId: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const dims = { ...l.dims };
        if (valueId) dims[definitionId] = valueId;
        else delete dims[definitionId];
        return { ...l, dims };
      }),
    );
  }

  function removeLine(id: string) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function toggleSide(id: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, side: l.side === 'DEBIT' ? 'CREDIT' : 'DEBIT' } : l,
      ),
    );
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null);

    if (!isBalanced) {
      setError(
        t(
          'journalEntryModal.error.unbalanced',
          'O lançamento está desequilibrado. Ajuste os valores antes de postar.',
        ),
      );
      return;
    }

    const missingAccount = lines.some((l) => !l.accountCode);
    const missingAmount = lines.some((l) => parseBrl(l.amountBrl) <= 0);

    if (missingAccount) {
      setError(t('journalEntryModal.error.missingAccount', 'Selecione uma conta para cada linha.'));
      return;
    }
    if (missingAmount) {
      setError(
        t('journalEntryModal.error.missingAmount', 'Informe um valor maior que zero em cada linha.'),
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await accountingService.postEntry({
        date,
        description,
        unitId,
        lines: lines.map((l) => {
          const dimensions = Object.values(l.dims).filter(Boolean);
          return {
            accountCode: l.accountCode,
            debitCents: l.side === 'DEBIT' ? parseBrl(l.amountBrl) : 0,
            creditCents: l.side === 'CREDIT' ? parseBrl(l.amountBrl) : 0,
            ...(dimensions.length ? { dimensions } : {}),
          };
        }),
      });
      // Reset form state before closing
      setDate(today());
      setDescription('');
      setLines(DEFAULT_LINES);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      // apiClient throws a PLAIN OBJECT (not an Error) — read the backend message off it so
      // specific rejections (e.g. a dimension leg carrying two values of the same axis) surface
      // inline, not just the generic fallback.
      setError(resolveError(err, t('journalEntryModal.error.postFailed', 'Erro ao postar o lançamento. Tente novamente.')));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('journalEntryModal.title', 'Novo Lançamento')}
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      themeColor="bg-emerald-600"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {t('journalEntryModal.button.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isBalanced || isSubmitting}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? t('journalEntryModal.button.posting', 'Postando…')
              : t('journalEntryModal.button.post', 'Postar')}
          </button>
        </>
      }
    >
      <div className="space-y-5 px-6 py-5">
        {/* ── Date + Description ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('journalEntryModal.field.date', 'Data')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('journalEntryModal.field.description', 'Descrição')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('journalEntryModal.field.descriptionPlaceholder', 'Histórico do lançamento…')}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ── Lines ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('journalEntryModal.lines.heading', 'Partidas')}
          </p>

          <div className="overflow-hidden rounded-2xl border border-neutral-800">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-500">
              <span>{t('journalEntryModal.column.account', 'Conta')}</span>
              <span className="px-3 text-center">{t('journalEntryModal.column.debitCredit', 'D / C')}</span>
              <span className="px-3 text-right">{t('journalEntryModal.column.amount', 'Valor (R$)')}</span>
              <span className="w-8" />
            </div>

            {/* Rows */}
            {lines.map((line) => (
              <div key={line.id} className="border-b border-neutral-800/60 last:border-0">
              <div
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-0 px-3 py-2"
              >
                {/* Account select */}
                <select
                  value={line.accountCode}
                  onChange={(e) => updateLine(line.id, { accountCode: e.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">{t('journalEntryModal.field.selectAccount', '— selecione a conta —')}</option>
                  {entryAccounts.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>

                {/* D/C toggle */}
                <button
                  type="button"
                  onClick={() => toggleSide(line.id)}
                  className={`mx-3 rounded-xl px-3 py-1.5 text-xs font-bold tracking-widest transition-colors ${
                    line.side === 'DEBIT'
                      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                      : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'
                  }`}
                  title={
                    line.side === 'DEBIT'
                      ? t('journalEntryModal.toggle.debitTitle', 'Débito — clique para alternar')
                      : t('journalEntryModal.toggle.creditTitle', 'Crédito — clique para alternar')
                  }
                >
                  {line.side === 'DEBIT' ? 'D' : 'C'}
                </button>

                {/* Amount input */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.amountBrl}
                  onChange={(e) => updateLine(line.id, { amountBrl: e.target.value })}
                  placeholder="0,00"
                  className="w-28 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-right text-sm text-neutral-100 placeholder-neutral-600 tabular-nums focus:border-emerald-500 focus:outline-none"
                />

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length <= 2}
                  className="ml-3 flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                  title={t('journalEntryModal.line.remove', 'Remover linha')}
                  aria-label={t('journalEntryModal.line.remove', 'Remover linha')}
                >
                  ×
                </button>
              </div>

              {/* Per-line dimension tagging (INCR-DIM) — optional, one leaf value per axis. */}
              {taggableAxes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                    {t('journalEntryModal.dimensions.label', 'Dimensões')}
                  </span>
                  {taggableAxes.map((axis) => (
                    <select
                      key={axis.definitionId}
                      value={line.dims[axis.definitionId] ?? ''}
                      onChange={(e) => setLineDim(line.id, axis.definitionId, e.target.value)}
                      title={axis.name}
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">
                        {t('journalEntryModal.dimensions.none', '— {{axis}} —', { axis: axis.name })}
                      </option>
                      {axis.leaves.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.code} — {v.name}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              )}
              </div>
            ))}
          </div>

          {/* Add line */}
          <button
            type="button"
            onClick={addLine}
            className="mt-1 rounded-xl border border-dashed border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-400 transition-colors hover:border-emerald-600 hover:text-emerald-400"
          >
            {t('journalEntryModal.line.add', '+ Adicionar linha')}
          </button>
        </div>

        {/* ── Balance indicator ── */}
        <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <p className="text-xs text-neutral-400">
            <span className="tabular-nums text-neutral-300">
              {t('journalEntryModal.balance.totalDebit', 'Σ Débitos: {{value}}', {
                value: formatCents(totalDebit),
              })}
            </span>
            <span className="mx-2 text-neutral-600">|</span>
            <span className="tabular-nums text-neutral-300">
              {t('journalEntryModal.balance.totalCredit', 'Σ Créditos: {{value}}', {
                value: formatCents(totalCredit),
              })}
            </span>
          </p>
          {isBalanced ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-400">
              {t('journalEntryModal.balance.balanced', 'Balanceado ✓')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600/15 px-3 py-1 text-xs font-semibold text-amber-400">
              {t('journalEntryModal.balance.unbalanced', 'Desequilibrado')}
            </span>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
