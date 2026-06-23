import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { accountingService } from '../../../lib/services/accounting.service';

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
}

interface Line {
  id: string;
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountBrl: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse a BRL input string ("1.234,56" or "1234.56") to integer cents. */
function parseBrl(s: string): number {
  const normalised = s.replace(',', '.');
  const parsed = parseFloat(normalised || '0');
  return Math.round(parsed * 100);
}

/** Format integer cents to BRL display string (e.g. "R$ 1.234,56"). */
function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

let nextId = 3;

const DEFAULT_LINES: Line[] = [
  { id: '1', accountCode: '', side: 'DEBIT', amountBrl: '' },
  { id: '2', accountCode: '', side: 'CREDIT', amountBrl: '' },
];

export function JournalEntryModal({
  isOpen,
  onClose,
  unitId,
  accounts,
  onSuccess,
}: JournalEntryModalProps) {
  const [date, setDate] = useState<string>(today);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>(DEFAULT_LINES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryAccounts = accounts.filter((a) => a.acceptsEntries);

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
      { id: String(nextId++), accountCode: '', side: 'DEBIT', amountBrl: '' },
    ]);
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
      setError('O lançamento está desequilibrado. Ajuste os valores antes de postar.');
      return;
    }

    const missingAccount = lines.some((l) => !l.accountCode);
    const missingAmount = lines.some((l) => parseBrl(l.amountBrl) <= 0);

    if (missingAccount) {
      setError('Selecione uma conta para cada linha.');
      return;
    }
    if (missingAmount) {
      setError('Informe um valor maior que zero em cada linha.');
      return;
    }

    setIsSubmitting(true);
    try {
      await accountingService.postEntry({
        date,
        description,
        unitId,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          debitCents: l.side === 'DEBIT' ? parseBrl(l.amountBrl) : 0,
          creditCents: l.side === 'CREDIT' ? parseBrl(l.amountBrl) : 0,
        })),
      });
      // Reset form state before closing
      setDate(today());
      setDescription('');
      setLines(DEFAULT_LINES);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao postar o lançamento. Tente novamente.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Lançamento"
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isBalanced || isSubmitting}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Postando…' : 'Postar'}
          </button>
        </>
      }
    >
      <div className="space-y-5 px-6 py-5">
        {/* ── Date + Description ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Data
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
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Histórico do lançamento…"
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ── Lines ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Partidas
          </p>

          <div className="overflow-hidden rounded-2xl border border-neutral-800">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-500">
              <span>Conta</span>
              <span className="px-3 text-center">D / C</span>
              <span className="px-3 text-right">Valor (R$)</span>
              <span className="w-8" />
            </div>

            {/* Rows */}
            {lines.map((line) => (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-0 border-b border-neutral-800/60 px-3 py-2 last:border-0"
              >
                {/* Account select */}
                <select
                  value={line.accountCode}
                  onChange={(e) => updateLine(line.id, { accountCode: e.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">— selecione a conta —</option>
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
                  title={line.side === 'DEBIT' ? 'Débito — clique para alternar' : 'Crédito — clique para alternar'}
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
                  title="Remover linha"
                  aria-label="Remover linha"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add line */}
          <button
            type="button"
            onClick={addLine}
            className="mt-1 rounded-xl border border-dashed border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-400 transition-colors hover:border-emerald-600 hover:text-emerald-400"
          >
            + Adicionar linha
          </button>
        </div>

        {/* ── Balance indicator ── */}
        <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <p className="text-xs text-neutral-400">
            <span className="tabular-nums text-neutral-300">
              Σ Débitos: {formatCents(totalDebit)}
            </span>
            <span className="mx-2 text-neutral-600">|</span>
            <span className="tabular-nums text-neutral-300">
              Σ Créditos: {formatCents(totalCredit)}
            </span>
          </p>
          {isBalanced ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-400">
              Balanceado ✓
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600/15 px-3 py-1 text-xs font-semibold text-amber-400">
              Desequilibrado
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
