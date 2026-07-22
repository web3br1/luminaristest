import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiChevronDown, FiChevronRight, FiPlusCircle, FiDollarSign, FiXCircle, FiRotateCcw } from 'react-icons/fi';
import {
  accountsPayableService,
  PAYMENT_METHODS,
  type PayableWithPayments,
  type PayablePayment,
  type PayableStatus,
  type PaymentMethod,
} from '../../../lib/services/accountsPayable.service';
import { accountingService, type Account } from '../../../lib/services/accounting.service';
import { counterpartiesService, type Counterparty } from '../../../lib/services/counterparties.service';
import { Modal } from '../../../components/ui/Modal';
import { CreatePayableModal } from './CreatePayableModal';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';
import { resolveErrorWithCode } from '../lib/resolveError';

// ── helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}


/** Sum of the ACTIVE payments on a payable (in cents). */
function sumActive(payments: PayablePayment[]): number {
  return payments.filter((p) => p.status === 'ACTIVE').reduce((acc, p) => acc + p.amountCents, 0);
}

// ── status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PayableStatus, string> = {
  OPEN: 'Em aberto',
  PAYING: 'Em pagamento',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASS: Record<PayableStatus, string> = {
  OPEN: 'bg-amber-900/40 text-amber-300',
  PAYING: 'bg-blue-900/40 text-blue-300',
  PAID: 'bg-emerald-900/40 text-emerald-300',
  CANCELLED: 'bg-neutral-700/60 text-neutral-300',
};

function StatusBadge({ status }: { status: PayableStatus }) {
  const { t } = useTranslation('accounting');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? 'bg-neutral-700/50 text-neutral-400'}`}
    >
      {t('contasAPagar.status.' + status, STATUS_LABEL[status] ?? status)}
    </span>
  );
}

// ── payments drawer ──────────────────────────────────────────────────────────

function PaymentsDrawer({ payable }: { payable: PayableWithPayments }) {
  const { t } = useTranslation('accounting');
  return (
    <tr>
      <td colSpan={8} className="bg-neutral-950/60 px-6 pb-3 pt-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-4 font-medium">{t('contasAPagar.payments.date', 'Pago em')}</th>
              <th className="py-1 pr-4 font-medium">{t('contasAPagar.payments.method', 'Forma')}</th>
              <th className="py-1 pr-4 text-right font-medium">{t('contasAPagar.payments.amount', 'Valor')}</th>
              <th className="py-1 font-medium">{t('contasAPagar.payments.status', 'Situação')}</th>
            </tr>
          </thead>
          <tbody>
            {payable.payments.map((p) => (
              <tr key={p.id} className="border-t border-neutral-800/50">
                <td className="py-1 pr-4 tabular-nums text-neutral-300">{formatDate(p.paidAt)}</td>
                <td className="py-1 pr-4 text-neutral-300">{p.method}</td>
                <td className="py-1 pr-4 text-right tabular-nums text-neutral-300">{formatCents(p.amountCents)}</td>
                <td className="py-1 text-neutral-400">
                  {p.status === 'ACTIVE'
                    ? t('contasAPagar.payments.active', 'Ativo')
                    : t('contasAPagar.payments.cancelled', 'Cancelado')}
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
  payable: PayableWithPayments;
  onPay: (p: PayableWithPayments) => void;
  onCancel: (p: PayableWithPayments) => void;
  onUndoPayment: (p: PayableWithPayments, payment: PayablePayment) => void;
}

function PayableRow({ payable, onPay, onCancel, onUndoPayment }: RowProps) {
  const { t } = useTranslation('accounting');
  const [expanded, setExpanded] = useState(false);
  const hasPayments = payable.payments.length > 0;
  const activePayment = payable.payments.find((p) => p.status === 'ACTIVE') ?? null;

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium transition-colors';

  return (
    <>
      <tr
        className={`border-b border-neutral-800/60 transition-colors last:border-0 ${hasPayments ? 'cursor-pointer hover:bg-neutral-800/30' : ''}`}
        onClick={() => hasPayments && setExpanded((v) => !v)}
      >
        <td className="w-8 px-3 py-2.5 text-neutral-500">
          {hasPayments ? (expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />) : null}
        </td>
        <td className="px-4 py-2.5 text-neutral-100">
          <span className="line-clamp-1 font-medium">{payable.supplierName}</span>
          {payable.documentNumber && (
            <span className="block font-mono text-xs text-neutral-500">{payable.documentNumber}</span>
          )}
        </td>
        <td className="max-w-xs px-4 py-2.5 text-neutral-300">
          <span className="line-clamp-1">{payable.description}</span>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatDate(payable.dueDate)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-100">{formatCents(payable.amountCents)}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={payable.status} />
        </td>
        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            {payable.status === 'OPEN' && (
              <>
                <button
                  onClick={() => onPay(payable)}
                  title={t('contasAPagar.action.payTitle', 'Registrar pagamento')}
                  className={`${btnBase} text-emerald-300 hover:border-emerald-600 hover:bg-emerald-900/30`}
                >
                  <FiDollarSign size={12} />
                  {t('contasAPagar.action.pay', 'Pagar')}
                </button>
                <button
                  onClick={() => onCancel(payable)}
                  title={t('contasAPagar.action.cancelTitle', 'Cancelar a conta')}
                  className={`${btnBase} text-neutral-300 hover:border-red-700 hover:bg-red-900/30 hover:text-red-300`}
                >
                  <FiXCircle size={12} />
                  {t('contasAPagar.action.cancel', 'Cancelar')}
                </button>
              </>
            )}
            {payable.status === 'PAID' && activePayment && (
              <button
                onClick={() => onUndoPayment(payable, activePayment)}
                title={t('contasAPagar.action.undoTitle', 'Desfazer o pagamento (reabre a conta)')}
                className={`${btnBase} text-neutral-300 hover:border-amber-700 hover:bg-amber-900/30 hover:text-amber-300`}
              >
                <FiRotateCcw size={12} />
                {t('contasAPagar.action.undo', 'Desfazer pagamento')}
              </button>
            )}
            {payable.status === 'PAYING' && (
              <span className="text-xs text-neutral-500">{t('contasAPagar.action.paying', 'Processando…')}</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasPayments && <PaymentsDrawer payable={payable} />}
    </>
  );
}

// ── action modal state ───────────────────────────────────────────────────────

type ActionState =
  | { type: 'pay'; payable: PayableWithPayments }
  | { type: 'cancelPayable'; payable: PayableWithPayments }
  | { type: 'cancelPayment'; payable: PayableWithPayments; payment: PayablePayment }
  | null;

// ── props ────────────────────────────────────────────────────────────────────

interface AccountsPayablePanelProps {
  unitId: string;
  /** Refetch the trial balance after any ledger-affecting write. */
  onLedgerChange?: () => void;
  /** Navigate to the Períodos tab (period-closed guidance). */
  onNavigateToPeriods?: () => void;
  /** Navigate to the Contrapartes tab (from the create modal when none is registered). */
  onNavigateToCounterparties?: () => void;
}

// ── main ─────────────────────────────────────────────────────────────────────

/**
 * AccountsPayablePanel — list of Contas a Pagar for a business unit. Create books
 * the recognition posting; per-row commands (pay / cancel / undo payment) each post
 * to the ledger via the AP command endpoints and refetch the trial balance.
 */
export function AccountsPayablePanel({ unitId, onLedgerChange, onNavigateToPeriods, onNavigateToCounterparties }: AccountsPayablePanelProps) {
  const { t } = useTranslation('accounting');
  const [payables, setPayables] = useState<PayableWithPayments[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);

  // action modal (pay / cancel payable / cancel payment)
  const [action, setAction] = useState<ActionState>(null);
  const [actionDate, setActionDate] = useState<string>(today);
  const [method, setMethod] = useState<PaymentMethod>('Pix');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPeriodError, setActionPeriodError] = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchPayables = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      // ponytail: single page of up to 200 (backend max). Add StandardPagination
      // if a unit ever carries more than 200 live payables.
      const result = await accountsPayableService.listPayables({ unitId, limit: 200 });
      setPayables(result.payables);
    } catch (err: unknown) {
      setError(resolveErrorWithCode(err, t('contasAPagar.error.load', 'Erro ao carregar as contas a pagar.')).message);
    } finally {
      setLoading(false);
    }
  }, [unitId, t]);

  useEffect(() => {
    void fetchPayables();
  }, [fetchPayables]);

  // ── create ─────────────────────────────────────────────────────────────────
  function openCreate() {
    if (!unitId) return;
    // Suppliers are a best-effort convenience list; a failed fetch must not block the create modal.
    counterpartiesService
      .listCounterparties({ unitId, type: 'SUPPLIER' })
      .then(setCounterparties)
      .catch(() => setCounterparties([]));
    accountingService
      .getAccounts(unitId)
      .then((r) => setExpenseAccounts(r.accounts.filter((a) => a.nature === 'Expense' && a.acceptsEntries)))
      .catch(() => setExpenseAccounts([]))
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
      if (action.type === 'pay') {
        const remaining = action.payable.amountCents - sumActive(action.payable.payments);
        await accountsPayableService.registerPayment(action.payable.id, {
          unitId,
          method,
          paidAt: actionDate,
          amountCents: remaining,
        });
      } else if (action.type === 'cancelPayable') {
        await accountsPayableService.cancelPayable(action.payable.id, {
          unitId,
          reversalDate: actionDate,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      } else {
        await accountsPayableService.cancelPayment(action.payable.id, action.payment.id, {
          unitId,
          reversalDate: actionDate,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      }
      setAction(null);
      await fetchPayables();
      onLedgerChange?.();
    } catch (err: unknown) {
      const { message, code } = resolveErrorWithCode(err, t('contasAPagar.error.action', 'Não foi possível concluir a operação.'));
      if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') setActionPeriodError(true);
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  // ── action modal copy (per type) ─────────────────────────────────────────────
  const isPay = action?.type === 'pay';
  const modalTheme = isPay ? 'bg-emerald-600' : 'bg-red-600';
  const confirmBtnClass = isPay
    ? 'bg-emerald-600 hover:bg-emerald-500'
    : 'bg-red-700 hover:bg-red-600';
  const dateLabel = isPay
    ? t('contasAPagar.actionModal.paidAtLabel', 'Data do pagamento')
    : t('contasAPagar.actionModal.reversalDateLabel', 'Data da reversão');

  let modalTitle = '';
  let confirmLabel = '';
  let busyLabel = '';
  if (action?.type === 'pay') {
    modalTitle = t('contasAPagar.actionModal.payTitle', 'Registrar pagamento');
    confirmLabel = t('contasAPagar.actionModal.payConfirm', 'Confirmar pagamento');
    busyLabel = t('contasAPagar.actionModal.paying', 'Registrando…');
  } else if (action?.type === 'cancelPayable') {
    modalTitle = t('contasAPagar.actionModal.cancelTitle', 'Cancelar conta a pagar');
    confirmLabel = t('contasAPagar.actionModal.cancelConfirm', 'Confirmar cancelamento');
    busyLabel = t('contasAPagar.actionModal.cancelling', 'Cancelando…');
  } else if (action?.type === 'cancelPayment') {
    modalTitle = t('contasAPagar.actionModal.undoTitle', 'Desfazer pagamento');
    confirmLabel = t('contasAPagar.actionModal.undoConfirm', 'Confirmar');
    busyLabel = t('contasAPagar.actionModal.undoing', 'Desfazendo…');
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row: title + new button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-200">{t('contasAPagar.heading', 'Contas a Pagar')}</h2>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
        >
          <FiPlusCircle size={16} />
          {t('contasAPagar.newPayable', 'Nova Conta')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-neutral-400">{t('contasAPagar.loading', 'Carregando contas a pagar…')}</div>
      )}

      {/* Empty */}
      {!loading && payables.length === 0 && !error && (
        <div className="py-16 text-center text-neutral-500">
          {t('contasAPagar.empty', 'Nenhuma conta a pagar registrada nesta unidade ainda.')}
        </div>
      )}

      {/* Table */}
      {!loading && payables.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="w-8 px-3 py-3" aria-label={t('contasAPagar.col.expand', 'Expandir')} />
                <th className="px-4 py-3 font-medium">{t('contasAPagar.col.supplier', 'Fornecedor')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAPagar.col.description', 'Descrição')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAPagar.col.dueDate', 'Vencimento')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('contasAPagar.col.amount', 'Valor')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAPagar.col.status', 'Status')}</th>
                <th className="px-4 py-3 font-medium">{t('contasAPagar.col.actions', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((p) => (
                <PayableRow
                  key={p.id}
                  payable={p}
                  onPay={(pa) => openAction({ type: 'pay', payable: pa })}
                  onCancel={(pa) => openAction({ type: 'cancelPayable', payable: pa })}
                  onUndoPayment={(pa, payment) => openAction({ type: 'cancelPayment', payable: pa, payment })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <CreatePayableModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        unitId={unitId}
        expenseAccounts={expenseAccounts}
        counterparties={counterparties}
        onSuccess={() => {
          setIsCreateOpen(false);
          void fetchPayables();
          onLedgerChange?.();
        }}
        onNavigateToPeriods={onNavigateToPeriods}
        onNavigateToCounterparties={onNavigateToCounterparties}
      />

      {/* Action modal (pay / cancel / undo) */}
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
              {t('contasAPagar.actionModal.cancel', 'Voltar')}
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
              <span className="font-semibold text-neutral-100">{action.payable.supplierName}</span>
              {' — '}
              {action.payable.description}
              {' · '}
              <span className="tabular-nums text-neutral-100">{formatCents(action.payable.amountCents)}</span>
            </p>
          )}

          {/* Method (pay only) */}
          {isPay && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {t('contasAPagar.actionModal.methodLabel', 'Forma de pagamento')}
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
              >
                {PAYMENT_METHODS.map((m) => (
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
              className={`rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none ${isPay ? 'focus:border-emerald-500' : 'focus:border-red-500'}`}
            />
          </div>

          {/* Reason (cancels only) */}
          {!isPay && action && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {t('contasAPagar.actionModal.reasonLabel', 'Motivo')}
                <span className="ml-1 normal-case text-neutral-600">{t('contasAPagar.createModal.optional', '(opcional)')}</span>
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
          {isPay && (
            <p className="text-neutral-400">
              {t('contasAPagar.actionModal.payNote', 'Será lançado D Fornecedores / C Banco pelo saldo integral. Pagamento parcial não é suportado.')}
            </p>
          )}
          {action?.type === 'cancelPayable' && (
            <p className="text-neutral-400">
              {t('contasAPagar.actionModal.cancelNote', 'O lançamento de reconhecimento será estornado na data acima. Esta ação não pode ser desfeita.')}
            </p>
          )}
          {action?.type === 'cancelPayment' && (
            <p className="text-neutral-400">
              {t('contasAPagar.actionModal.undoNote', 'O pagamento será estornado e a conta voltará para “Em aberto”.')}
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
                    {t('contasAPagar.viewPeriods', 'Ver Períodos')}
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
