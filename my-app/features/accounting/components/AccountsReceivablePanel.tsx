import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiChevronDown, FiChevronRight, FiPlusCircle, FiDollarSign, FiXCircle, FiRotateCcw } from 'react-icons/fi';
import {
  accountsReceivableService,
  RECEIPT_METHODS,
  type ReceivableWithReceipts,
  type ReceivableReceipt,
  type ReceivableStatus,
  type ReceiptMethod,
} from '../../../lib/services/accountsReceivable.service';
import { accountingService, type Account } from '../../../lib/services/accounting.service';
import { Modal } from '../../../components/ui/Modal';
import { CreateReceivableModal } from './CreateReceivableModal';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';

// ── helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Extract a human message + code from apiClient's thrown error object. */
function resolveError(e: unknown, fallback: string): { message: string; code?: string } {
  if (e && typeof e === 'object') {
    const o = e as { error?: unknown; message?: unknown; code?: unknown };
    const code = typeof o.code === 'string' ? o.code : undefined;
    if (typeof o.message === 'string') return { message: o.message, code };
    if (typeof o.error === 'string') return { message: o.error, code };
    return { message: fallback, code };
  }
  return { message: fallback };
}

/** Sum of the ACTIVE receipts on a receivable (in cents). */
function sumActive(receipts: ReceivableReceipt[]): number {
  return receipts.filter((r) => r.status === 'ACTIVE').reduce((acc, r) => acc + r.amountCents, 0);
}

// ── status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  OPEN: 'Em aberto',
  RECEIVING: 'Em recebimento',
  RECEIVED: 'Recebida',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASS: Record<ReceivableStatus, string> = {
  OPEN: 'bg-amber-900/40 text-amber-300',
  RECEIVING: 'bg-blue-900/40 text-blue-300',
  RECEIVED: 'bg-emerald-900/40 text-emerald-300',
  CANCELLED: 'bg-neutral-700/60 text-neutral-300',
};

function StatusBadge({ status }: { status: ReceivableStatus }) {
  const { t } = useTranslation('accounting');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? 'bg-neutral-700/50 text-neutral-400'}`}
    >
      {t('contasAReceber.status.' + status, STATUS_LABEL[status] ?? status)}
    </span>
  );
}

// ── receipts drawer ──────────────────────────────────────────────────────────

function ReceiptsDrawer({ receivable }: { receivable: ReceivableWithReceipts }) {
  const { t } = useTranslation('accounting');
  return (
    <tr>
      <td colSpan={8} className="bg-neutral-950/60 px-6 pb-3 pt-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-4 font-medium">{t('contasAReceber.receipts.date', 'Recebido em')}</th>
              <th className="py-1 pr-4 font-medium">{t('contasAReceber.receipts.method', 'Forma')}</th>
              <th className="py-1 pr-4 text-right font-medium">{t('contasAReceber.receipts.amount', 'Valor')}</th>
              <th className="py-1 font-medium">{t('contasAReceber.receipts.status', 'Situação')}</th>
            </tr>
          </thead>
          <tbody>
            {receivable.receipts.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800/50">
                <td className="py-1 pr-4 tabular-nums text-neutral-300">{formatDate(r.receivedAt)}</td>
                <td className="py-1 pr-4 text-neutral-300">{r.method}</td>
                <td className="py-1 pr-4 text-right tabular-nums text-neutral-300">{formatCents(r.amountCents)}</td>
                <td className="py-1 text-neutral-400">
                  {r.status === 'ACTIVE'
                    ? t('contasAReceber.receipts.active', 'Ativo')
                    : t('contasAReceber.receipts.cancelled', 'Cancelado')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  receivable: ReceivableWithReceipts;
  onReceive: (r: ReceivableWithReceipts) => void;
  onCancel: (r: ReceivableWithReceipts) => void;
  onUndoReceipt: (r: ReceivableWithReceipts, receipt: ReceivableReceipt) => void;
}

function ReceivableRow({ receivable, onReceive, onCancel, onUndoReceipt }: RowProps) {
  const { t } = useTranslation('accounting');
  const [expanded, setExpanded] = useState(false);
  const hasReceipts = receivable.receipts.length > 0;
  const activeReceipt = receivable.receipts.find((r) => r.status === 'ACTIVE') ?? null;

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors';

  return (
    <>
      <tr
        className={`border-b border-neutral-800/60 transition-colors last:border-0 ${hasReceipts ? 'cursor-pointer hover:bg-neutral-800/30' : ''}`}
        onClick={() => hasReceipts && setExpanded((v) => !v)}
      >
        <td className="w-8 px-3 py-2.5 text-neutral-500">
          {hasReceipts ? (expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />) : null}
        </td>
        <td className="px-4 py-2.5 text-neutral-100">
          <span className="line-clamp-1 font-medium">{receivable.customerName}</span>
          {receivable.documentNumber && (
            <span className="block font-mono text-xs text-neutral-500">{receivable.documentNumber}</span>
          )}
        </td>
        <td className="max-w-xs px-4 py-2.5 text-neutral-300">
          <span className="line-clamp-1">{receivable.description}</span>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatDate(receivable.dueDate)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-100">{formatCents(receivable.amountCents)}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={receivable.status} />
        </td>
        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            {receivable.status === 'OPEN' && (
              <>
                <button
                  onClick={() => onReceive(receivable)}
                  title={t('contasAReceber.action.receiveTitle', 'Registrar recebimento')}
                  className={`${btnBase} text-emerald-300 hover:border-emerald-600 hover:bg-emerald-900/30`}
                >
                  <FiDollarSign size={12} />
                  {t('contasAReceber.action.receive', 'Receber')}
                </button>
                <button
                  onClick={() => onCancel(receivable)}
                  title={t('contasAReceber.action.cancelTitle', 'Cancelar a conta')}
                  className={`${btnBase} text-neutral-300 hover:border-red-700 hover:bg-red-900/30 hover:text-red-300`}
                >
                  <FiXCircle size={12} />
                  {t('contasAReceber.action.cancel', 'Cancelar')}
                </button>
              </>
            )}
            {receivable.status === 'RECEIVED' && activeReceipt && (
              <button
                onClick={() => onUndoReceipt(receivable, activeReceipt)}
                title={t('contasAReceber.action.undoTitle', 'Desfazer o recebimento (reabre a conta)')}
                className={`${btnBase} text-neutral-300 hover:border-amber-700 hover:bg-amber-900/30 hover:text-amber-300`}
              >
                <FiRotateCcw size={12} />
                {t('contasAReceber.action.undo', 'Desfazer recebimento')}
              </button>
            )}
            {receivable.status === 'RECEIVING' && (
              <span className="text-xs text-neutral-500">{t('contasAReceber.action.receiving', 'Processando…')}</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasReceipts && <ReceiptsDrawer receivable={receivable} />}
    </>
  );
}

// ── action modal state ───────────────────────────────────────────────────────

type ActionState =
  | { type: 'receive'; receivable: ReceivableWithReceipts }
  | { type: 'cancelReceivable'; receivable: ReceivableWithReceipts }
  | { type: 'cancelReceipt'; receivable: ReceivableWithReceipts; receipt: ReceivableReceipt }
  | null;

// ── props ────────────────────────────────────────────────────────────────────

interface AccountsReceivablePanelProps {
  unitId: string;
  /** Refetch the trial balance after any ledger-affecting write. */
  onLedgerChange?: () => void;
  /** Navigate to the Períodos tab (period-closed guidance). */
  onNavigateToPeriods?: () => void;
}

// ── main ─────────────────────────────────────────────────────────────────────

/**
 * AccountsReceivablePanel — list of Contas a Receber for a business unit. Create books
 * the recognition posting; per-row commands (receive / cancel / undo receipt) each post
 * to the ledger via the AR command endpoints and refetch the trial balance.
 */
export function AccountsReceivablePanel({ unitId, onLedgerChange, onNavigateToPeriods }: AccountsReceivablePanelProps) {
  const { t } = useTranslation('accounting');
  const [receivables, setReceivables] = useState<ReceivableWithReceipts[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);

  // action modal (receive / cancel receivable / cancel receipt)
  const [action, setAction] = useState<ActionState>(null);
  const [actionDate, setActionDate] = useState<string>(today);
  const [method, setMethod] = useState<ReceiptMethod>('Pix');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPeriodError, setActionPeriodError] = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchReceivables = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      // ponytail: single page of up to 200 (backend max). Add StandardPagination
      // if a unit ever carries more than 200 live receivables.
      const result = await accountsReceivableService.listReceivables({ unitId, limit: 200 });
      setReceivables(result.receivables);
    } catch (err: unknown) {
      setError(resolveError(err, t('contasAReceber.error.load', 'Erro ao carregar as contas a receber.')).message);
    } finally {
      setLoading(false);
    }
  }, [unitId, t]);

  useEffect(() => {
    void fetchReceivables();
  }, [fetchReceivables]);

  // ── create ─────────────────────────────────────────────────────────────────
  function openCreate() {
    if (!unitId) return;
    accountingService
      .getAccounts(unitId)
      .then((r) => setRevenueAccounts(r.accounts.filter((a) => a.nature === 'Revenue' && a.acceptsEntries)))
      .catch(() => setRevenueAccounts([]))
      .finally(() => setIsCreateOpen(true));
  }

  // ── action open helpers ──────────────────────────────────────────────────────
  function openAction(next: ActionState) {
    setActionDate(today());
    setMethod('Pix');
    setReason('');
    setActionError(null);
    setActionPeriodError(false);
    setAction(next);
  }

  function closeAction() {
    if (busy) return;
    setAction(null);
    setActionError(null);
    setActionPeriodError(false);
  }

  // ── run the selected action ──────────────────────────────────────────────────
  async function runAction() {
    if (!action) return;
    setBusy(true);
    setActionError(null);
    setActionPeriodError(false);
    try {
      if (action.type === 'receive') {
        const remaining = action.receivable.amountCents - sumActive(action.receivable.receipts);
        await accountsReceivableService.registerReceipt(action.receivable.id, {
          unitId,
          method,
          receivedAt: actionDate,
          amountCents: remaining,
        });
      } else if (action.type === 'cancelReceivable') {
        await accountsReceivableService.cancelReceivable(action.receivable.id, {
          unitId,
          reversalDate: actionDate,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      } else {
        await accountsReceivableService.cancelReceipt(action.receivable.id, action.receipt.id, {
          unitId,
          reversalDate: actionDate,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      }
      setAction(null);
      await fetchReceivables();
      onLedgerChange?.();
    } catch (err: unknown) {
      const { message, code } = resolveError(err, t('contasAReceber.error.action', 'Não foi possível concluir a operação.'));
      if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') setActionPeriodError(true);
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  // ── action modal copy (per type) ─────────────────────────────────────────────
  const isReceive = action?.type === 'receive';
  const modalTheme = isReceive ? 'bg-emerald-600' : 'bg-red-600';
  const confirmBtnClass = isReceive
    ? 'bg-emerald-600 hover:bg-emerald-500'
    : 'bg-red-700 hover:bg-red-600';
  const dateLabel = isReceive
    ? t('contasAReceber.actionModal.receivedAtLabel', 'Data do recebimento')
    : t('contasAReceber.actionModal.reversalDateLabel', 'Data da reversão');

  let modalTitle = '';
  let confirmLabel = '';
  let busyLabel = '';
  if (action?.type === 'receive') {
    modalTitle = t('contasAReceber.actionModal.receiveTitle', 'Registrar recebimento');
    confirmLabel = t('contasAReceber.actionModal.receiveConfirm', 'Confirmar recebimento');
    busyLabel = t('contasAReceber.actionModal.receiving', 'Registrando…');
  } else if (action?.type === 'cancelReceivable') {
    modalTitle = t('contasAReceber.actionModal.cancelTitle', 'Cancelar conta a receber');
    confirmLabel = t('contasAReceber.actionModal.cancelConfirm', 'Confirmar cancelamento');
    busyLabel = t('contasAReceber.actionModal.cancelling', 'Cancelando…');
  } else if (action?.type === 'cancelReceipt') {
    modalTitle = t('contasAReceber.actionModal.undoTitle', 'Desfazer recebimento');
    confirmLabel = t('contasAReceber.actionModal.undoConfirm', 'Confirmar');
    busyLabel = t('contasAReceber.actionModal.undoing', 'Desfazendo…');
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row: title + new button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-200">{t('contasAReceber.heading', 'Contas a Receber')}</h2>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
        >
          <FiPlusCircle size={16} />
          {t('contasAReceber.newReceivable', 'Nova Conta')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-neutral-400">{t('contasAReceber.loading', 'Carregando contas a receber…')}</div>
      )}

      {/* Empty */}
      {!loading && receivables.length === 0 && !error && (
        <div className="py-16 text-center text-neutral-500">
          {t('contasAReceber.empty', 'Nenhuma conta a receber registrada nesta unidade ainda.')}
        </div>
      )}

      {/* Table */}
      {!loading && receivables.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="w-8 px-3 py-3" aria-label={t('contasAReceber.col.expand', 'Expandir')} />
                <th className="px-4 py-3 font-medium">{t('contasAReceber.col.customer', 'Cliente')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAReceber.col.description', 'Descrição')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAReceber.col.dueDate', 'Vencimento')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('contasAReceber.col.amount', 'Valor')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAReceber.col.status', 'Status')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAReceber.col.actions', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((r) => (
                <ReceivableRow
                  key={r.id}
                  receivable={r}
                  onReceive={(re) => openAction({ type: 'receive', receivable: re })}
                  onCancel={(re) => openAction({ type: 'cancelReceivable', receivable: re })}
                  onUndoReceipt={(re, receipt) => openAction({ type: 'cancelReceipt', receivable: re, receipt })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <CreateReceivableModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        unitId={unitId}
        revenueAccounts={revenueAccounts}
        onSuccess={() => {
          setIsCreateOpen(false);
          void fetchReceivables();
          onLedgerChange?.();
        }}
        onNavigateToPeriods={onNavigateToPeriods}
      />

      {/* Action modal (receive / cancel / undo) */}
      <Modal
        isOpen={!!action}
        onClose={closeAction}
        title={modalTitle}
        themeColor={modalTheme}
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={closeAction}
              disabled={busy}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {t('contasAReceber.actionModal.cancel', 'Voltar')}
            </button>
            <button
              onClick={() => void runAction()}
              disabled={busy}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${confirmBtnClass}`}
            >
              {busy ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {busyLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4 px-6 py-5 text-sm text-neutral-300">
          {action && (
            <p>
              <span className="font-semibold text-neutral-100">{action.receivable.customerName}</span>
              {' — '}
              {action.receivable.description}
              {' · '}
              <span className="tabular-nums text-neutral-100">{formatCents(action.receivable.amountCents)}</span>
            </p>
          )}

          {/* Method (receive only) */}
          {isReceive && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {t('contasAReceber.actionModal.methodLabel', 'Forma de recebimento')}
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as ReceiptMethod)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
              >
                {RECEIPT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">{dateLabel}</label>
            <input
              type="date"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              className={`rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none ${isReceive ? 'focus:border-emerald-500' : 'focus:border-red-500'}`}
            />
          </div>

          {/* Reason (cancels only) */}
          {!isReceive && action && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {t('contasAReceber.actionModal.reasonLabel', 'Motivo')}
                <span className="ml-1 normal-case text-neutral-600">{t('contasAReceber.createModal.optional', '(opcional)')}</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-red-500 focus:outline-none"
              />
            </div>
          )}

          {/* Contextual note */}
          {isReceive && (
            <p className="text-neutral-400">
              {t('contasAReceber.actionModal.receiveNote', 'Será lançado D Banco / C Clientes pelo saldo integral. Recebimento parcial não é suportado.')}
            </p>
          )}
          {action?.type === 'cancelReceivable' && (
            <p className="text-neutral-400">
              {t('contasAReceber.actionModal.cancelNote', 'O lançamento de reconhecimento será estornado na data acima. Esta ação não pode ser desfeita.')}
            </p>
          )}
          {action?.type === 'cancelReceipt' && (
            <p className="text-neutral-400">
              {t('contasAReceber.actionModal.undoNote', 'O recebimento será estornado e a conta voltará para “Em aberto”.')}
            </p>
          )}

          {/* Error */}
          {actionError && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {actionError}
              {actionPeriodError && onNavigateToPeriods && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => { setAction(null); onNavigateToPeriods(); }}
                    className="underline hover:text-red-200"
                  >
                    {t('contasAReceber.viewPeriods', 'Ver Períodos')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
