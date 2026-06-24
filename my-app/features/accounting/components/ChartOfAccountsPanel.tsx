import React, { useCallback, useEffect, useState } from 'react';
import { ConfirmModal } from '../../../components/ui/feedback/ConfirmModal';
import { accountingService } from '../../../lib/services/accounting.service';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string;
  name: string;
  nature: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  acceptsEntries: boolean;
  isDefault?: boolean;
  deletedAt?: string | null;
}

export interface ChartOfAccountsPanelProps {
  unitId: string;
  canManage: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<Account['nature'], string> = {
  Asset: 'Ativo',
  Liability: 'Passivo',
  Equity: 'Patrimônio',
  Revenue: 'Receita',
  Expense: 'Despesa',
};

const ACCOUNT_TYPES: Array<{ value: Account['nature']; label: string }> = [
  { value: 'Asset', label: 'Ativo' },
  { value: 'Liability', label: 'Passivo' },
  { value: 'Equity', label: 'Patrimônio' },
  { value: 'Revenue', label: 'Receita' },
  { value: 'Expense', label: 'Despesa' },
];

const EMPTY_FORM = {
  code: '',
  name: '',
  nature: 'Asset' as Account['nature'],
  acceptsEntries: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ChartOfAccountsPanel — lists the chart of accounts (plano de contas) for a
 * business unit, with optional create / delete for managers. Persists via the
 * accounting service; money-layer conventions apply (first-class Prisma, not
 * DynamicTable).
 */
export function ChartOfAccountsPanel({ unitId, canManage }: ChartOfAccountsPanelProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      // accountingService.getAccounts will be wired by the integration agent
      const res = await (accountingService as unknown as {
        getAccounts(unitId: string): Promise<{ accounts: Account[] }>;
      }).getAccounts(unitId);
      setAccounts(res.accounts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar contas.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.code.trim() || !newAccount.name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await (accountingService as unknown as {
        createAccount(data: {
          code: string;
          name: string;
          nature: string;
          acceptsEntries: boolean;
          unitId: string;
        }): Promise<{ account: Account }>;
      }).createAccount({ ...newAccount, unitId });
      setNewAccount(EMPTY_FORM);
      setShowAddForm(false);
      await fetchAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    setIsSubmitting(true);
    setDeleteError(null);
    try {
      await (accountingService as unknown as {
        deleteAccount(id: string): Promise<{ success: boolean }>;
      }).deleteAccount(confirmDeleteId);
      setConfirmDeleteId(null);
      await fetchAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir conta.';
      setDeleteError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const pendingAccount = accounts.find((a) => a.id === confirmDeleteId);
  const deleteMessage = pendingAccount
    ? `Excluir conta ${pendingAccount.code} — ${pendingAccount.name}? Esta ação não pode ser desfeita.`
    : undefined;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-100">Plano de Contas</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
          >
            {showAddForm ? 'Cancelar' : 'Nova Conta'}
          </button>
        )}
      </div>

      {/* Add form */}
      {canManage && showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-2xl border border-neutral-700 bg-neutral-900/60 p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-neutral-300">Nova conta contábil</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Code */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-400" htmlFor="acc-code">
                Código
              </label>
              <input
                id="acc-code"
                type="text"
                required
                value={newAccount.code}
                onChange={(e) => setNewAccount((s) => ({ ...s, code: e.target.value }))}
                placeholder="Ex: 1.1.01"
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-400" htmlFor="acc-name">
                Nome
              </label>
              <input
                id="acc-name"
                type="text"
                required
                value={newAccount.name}
                onChange={(e) => setNewAccount((s) => ({ ...s, name: e.target.value }))}
                placeholder="Ex: Caixa"
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-400" htmlFor="acc-type">
                Tipo
              </label>
              <select
                id="acc-type"
                value={newAccount.nature}
                onChange={(e) =>
                  setNewAccount((s) => ({ ...s, nature: e.target.value as Account['nature'] }))
                }
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* acceptsEntries */}
            <div className="flex items-center gap-3 pt-6">
              <input
                id="acc-accepts-entries"
                type="checkbox"
                checked={newAccount.acceptsEntries}
                onChange={(e) =>
                  setNewAccount((s) => ({ ...s, acceptsEntries: e.target.checked }))
                }
                className="h-4 w-4 rounded accent-emerald-500"
              />
              <label
                htmlFor="acc-accepts-entries"
                className="text-sm font-medium text-neutral-300 cursor-pointer"
              >
                Aceita lançamentos
              </label>
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewAccount(EMPTY_FORM);
                setError(null);
              }}
              disabled={isSubmitting}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {/* Error (outside form) */}
      {error && !showAddForm && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-neutral-400">Carregando plano de contas…</div>
      ) : accounts.length === 0 ? (
        <div className="py-16 text-center text-neutral-500">
          Nenhuma conta cadastrada nesta unidade.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Aceita lançamentos</th>
                {canManage && <th className="px-4 py-3 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-neutral-800/60 last:border-0 transition-colors hover:bg-neutral-800/20"
                >
                  <td className="px-4 py-2.5 font-mono text-neutral-300">{account.code}</td>
                  <td className="px-4 py-2.5 text-neutral-100">{account.name}</td>
                  <td className="px-4 py-2.5 text-neutral-400">
                    {TYPE_LABEL[account.nature] ?? account.nature}
                  </td>
                  <td className="px-4 py-2.5">
                    {account.acceptsEntries ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-600/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        Sim
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-neutral-700/50 px-2 py-0.5 text-xs font-medium text-neutral-500">
                        Não
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5">
                      {!account.isDefault && !account.deletedAt && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDeleteId(account.id);
                          }}
                          className="rounded-lg border border-red-900/50 px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-950/30 hover:text-red-300"
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm modal */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => {
          setConfirmDeleteId(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteConfirm}
        variant="danger"
        title="Excluir conta?"
        message={deleteMessage}
        confirmLabel="Sim, excluir"
        cancelLabel="Cancelar"
        isLoading={isSubmitting}
        error={deleteError}
      />
    </div>
  );
}

export default ChartOfAccountsPanel;
