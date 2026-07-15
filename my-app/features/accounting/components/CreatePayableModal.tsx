import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import {
  accountsPayableService,
  type CreatePayablePayload,
} from '../../../lib/services/accountsPayable.service';
import type { Account } from '../../../lib/services/accounting.service';
import type { Counterparty } from '../../../lib/services/counterparties.service';

export interface CreatePayableModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  /** Analytic expense accounts (nature=Expense, acceptsEntries) — option value is the account **id**. */
  expenseAccounts: Account[];
  /** Active SUPPLIER counterparties of this unit — option value is the counterparty **id** (optional link). */
  counterparties?: Counterparty[];
  onSuccess: () => void;
  /** Navigate to the Períodos tab (shown when the period is closed). */
  onNavigateToPeriods?: () => void;
  /** Navigate to the Contrapartes tab (shown when none is registered). */
  onNavigateToCounterparties?: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parse a money input string to integer cents. BR convention: comma is the
 * decimal separator, dots group thousands ("1.234,56" → 123456). Tolerates a
 * US-style dot-decimal ("1234.56", "19.99") only when there is no comma and the
 * dot is followed by 1–2 digits — otherwise a lone dot is a thousands separator
 * ("1.000" → 100000), so a dot typed as decimal never books a 100× entry.
 */
export function parseBrl(s: string): number {
  const trimmed = (s || '').trim();
  let normalised: string;
  if (trimmed.includes(',')) {
    normalised = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{1,2}$/.test(trimmed)) {
    normalised = trimmed; // lone dot with ≤2 trailing digits → decimal point
  } else {
    normalised = trimmed.replace(/\./g, ''); // dots are thousands separators
  }
  const parsed = parseFloat(normalised || '0');
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
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

export function CreatePayableModal({
  isOpen,
  onClose,
  unitId,
  expenseAccounts,
  counterparties = [],
  onSuccess,
  onNavigateToPeriods,
  onNavigateToCounterparties,
}: CreatePayableModalProps) {
  const { t } = useTranslation('accounting');
  const [supplierName, setSupplierName] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueDate, setIssueDate] = useState<string>(today);
  const [dueDate, setDueDate] = useState<string>(today);
  const [amountBrl, setAmountBrl] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState(false);

  const analyticExpense = expenseAccounts.filter(
    (a) => a.nature === 'Expense' && a.acceptsEntries,
  );

  const amountCents = parseBrl(amountBrl);
  const isValid =
    supplierName.trim() !== '' &&
    description.trim() !== '' &&
    !!issueDate &&
    !!dueDate &&
    amountCents > 0 &&
    expenseAccountId !== '';

  const isDirty =
    supplierName !== '' ||
    counterpartyId !== '' ||
    documentNumber !== '' ||
    description !== '' ||
    amountBrl !== '' ||
    expenseAccountId !== '';

  /** Selecting a counterparty prefills the supplier name snapshot when it is still blank. */
  function handleCounterpartyChange(id: string) {
    setCounterpartyId(id);
    const cp = counterparties.find((c) => c.id === id);
    if (cp && supplierName.trim() === '') setSupplierName(cp.name);
  }

  function reset() {
    setSupplierName('');
    setCounterpartyId('');
    setDocumentNumber('');
    setDescription('');
    setIssueDate(today());
    setDueDate(today());
    setAmountBrl('');
    setExpenseAccountId('');
    setError(null);
    setPeriodError(false);
  }

  function handleClose() {
    if (isSubmitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    setPeriodError(false);
    if (!isValid) {
      setError(t('contasAPagar.createModal.error.invalid', 'Preencha fornecedor, descrição, datas, valor e conta de despesa.'));
      return;
    }

    const payload: CreatePayablePayload = {
      unitId,
      supplierName: supplierName.trim(),
      description: description.trim(),
      issueDate,
      dueDate,
      amountCents,
      expenseAccountId,
      ...(counterpartyId ? { counterpartyId } : {}),
      ...(documentNumber.trim() ? { documentNumber: documentNumber.trim() } : {}),
    };

    setIsSubmitting(true);
    try {
      await accountsPayableService.createPayable(payload);
      reset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const { message, code } = resolveError(err, t('contasAPagar.createModal.error.failed', 'Erro ao registrar a conta a pagar.'));
      if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') setPeriodError(true);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('contasAPagar.createModal.title', 'Nova Conta a Pagar')}
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      themeColor="bg-emerald-600"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-50"
          >
            {t('contasAPagar.createModal.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!isValid || isSubmitting}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? t('contasAPagar.createModal.saving', 'Registrando…')
              : t('contasAPagar.createModal.submit', 'Registrar')}
          </button>
        </>
      }
    >
      <div className="space-y-5 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Counterparty (optional link) */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.counterparty', 'Contraparte')}
              <span className="ml-1 normal-case text-neutral-600">{t('contasAPagar.createModal.optional', '(opcional)')}</span>
            </label>
            <select
              value={counterpartyId}
              onChange={(e) => handleCounterpartyChange(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">{t('contasAPagar.createModal.field.noCounterparty', '— sem contraparte —')}</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {counterparties.length === 0 && (
              <p className="text-xs text-neutral-500">
                {t('contasAPagar.createModal.noCounterparties', 'Nenhum fornecedor cadastrado.')}
                {onNavigateToCounterparties && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => { reset(); onClose(); onNavigateToCounterparties(); }}
                      className="underline hover:text-neutral-300"
                    >
                      {t('contasAPagar.createModal.manageCounterparties', 'Cadastrar contrapartes')}
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Supplier */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.supplier', 'Fornecedor')}
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder={t('contasAPagar.createModal.field.supplierPlaceholder', 'Nome do fornecedor…')}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.description', 'Descrição')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('contasAPagar.createModal.field.descriptionPlaceholder', 'Ex.: aluguel, energia, insumos…')}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Document number */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.document', 'Nº do documento')}
              <span className="ml-1 normal-case text-neutral-600">{t('contasAPagar.createModal.optional', '(opcional)')}</span>
            </label>
            <input
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder={t('contasAPagar.createModal.field.documentPlaceholder', 'NF, boleto…')}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.amount', 'Valor (R$)')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amountBrl}
              onChange={(e) => setAmountBrl(e.target.value)}
              placeholder="0,00"
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-right text-sm tabular-nums text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Issue date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.issueDate', 'Emissão')}
            </label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Due date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.dueDate', 'Vencimento')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Expense account */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contasAPagar.createModal.field.expenseAccount', 'Conta de despesa (contrapartida)')}
            </label>
            <select
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">{t('contasAPagar.createModal.field.selectAccount', '— selecione a conta de despesa —')}</option>
              {analyticExpense.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            {analyticExpense.length === 0 && (
              <p className="text-xs text-amber-400">
                {t('contasAPagar.createModal.noExpenseAccounts', 'Nenhuma conta de despesa analítica encontrada. Cadastre uma no Plano de Contas.')}
              </p>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
            {periodError && onNavigateToPeriods && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => { reset(); onClose(); onNavigateToPeriods(); }}
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
  );
}
