import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * Accounts Payable (Contas a Pagar) service — thin typed client over the AP
 * command endpoints (`/api/payables/*`). All invariants (double-entry recognition/
 * settlement, period gate, status CAS, full-payment rule) live on the backend
 * (PayableService); this only shapes requests/responses. Money is INTEGER CENTS
 * end to end; date fields are `YYYY-MM-DD` strings.
 */

const CTX = 'Contas a Pagar';

/** The standard server response envelope: { success, data }. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// ── Domain types ───────────────────────────────────────────────────────────────
export type PayableStatus = 'OPEN' | 'PAYING' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'Cash' | 'Pix' | 'TED' | 'Boleto';
export type PaymentStatus = 'ACTIVE' | 'CANCELLED';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['Cash', 'Pix', 'TED', 'Boleto'];

export interface PayablePayment {
  id: string;
  userId: string;
  unitId: string;
  payableId: string;
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  paidByUserId: string | null;
  status: PaymentStatus;
  entryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payable {
  id: string;
  userId: string;
  unitId: string;
  supplierName: string;
  supplierRef: string | null;
  /** FK to a Counterparty(SUPPLIER) of this unit (INCR-COUNTERPARTY / A1); nullable. */
  counterpartyId: string | null;
  documentNumber: string | null;
  description: string;
  issueDate: string;
  dueDate: string;
  amountCents: number;
  expenseAccountId: string;
  status: PayableStatus;
  createdById: string | null;
  cancelledById: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** List/get reads embed the payment history. */
export interface PayableWithPayments extends Payable {
  payments: PayablePayment[];
}

// ── Request payloads ─────────────────────────────────────────────────────────────
export interface ListPayablesQuery {
  unitId: string;
  status?: PayableStatus;
  page?: number;
  limit?: number;
}

export interface CreatePayablePayload {
  unitId: string;
  supplierName: string;
  supplierRef?: string;
  documentNumber?: string;
  description: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  amountCents: number;
  /** Chart-of-accounts account **id** (analytic, nature=Expense). */
  expenseAccountId: string;
  /** Optional FK to a Counterparty(SUPPLIER) of this unit (re-scoped on the backend). */
  counterpartyId?: string;
  attachmentId?: string;
}

export interface RegisterPaymentPayload {
  unitId: string;
  method: PaymentMethod;
  /** YYYY-MM-DD — effective bank-debit date. */
  paidAt: string;
  /** Must equal the full remaining balance (partial payment not supported). */
  amountCents: number;
}

export interface CancelPayablePayload {
  unitId: string;
  /** YYYY-MM-DD — gates on the period this date belongs to. */
  reversalDate: string;
  reason?: string;
}

export interface CancelPaymentPayload {
  unitId: string;
  /** YYYY-MM-DD */
  reversalDate: string;
  reason?: string;
}

export interface ListPayablesResult {
  payables: PayableWithPayments[];
  total: number;
}

/** Build a `?a=x&b=y` query string, dropping undefined/empty values and encoding. */
function buildQuery(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const accountsPayableService = {
  /** List payables for a unit (paginated, payment history embedded), read-only. */
  async listPayables(query: ListPayablesQuery): Promise<ListPayablesResult> {
    const qs = buildQuery({
      unitId: query.unitId,
      status: query.status,
      page: query.page !== undefined ? String(query.page) : undefined,
      limit: query.limit !== undefined ? String(query.limit) : undefined,
    });
    const res = await apiClient.get<ApiEnvelope<ListPayablesResult>>(`/payables${qs}`);
    return res.data;
  },

  /** Create a payable — books the recognition posting (D despesa / C fornecedores). */
  async createPayable(payload: CreatePayablePayload): Promise<Payable> {
    const res = await apiClient.post<ApiEnvelope<Payable>>('/payables', payload);
    notify('Conta a pagar registrada.', 'success', CTX);
    return res.data;
  },

  /** Register the (full) payment — books settlement (D fornecedores / C banco) → PAID. */
  async registerPayment(payableId: string, payload: RegisterPaymentPayload): Promise<PayablePayment> {
    const res = await apiClient.post<ApiEnvelope<PayablePayment>>(
      `/payables/${encodeURIComponent(payableId)}/pay`,
      payload,
    );
    notify('Pagamento registrado.', 'success', CTX);
    return res.data;
  },

  /** Cancel an OPEN payable — reverses the recognition posting. */
  async cancelPayable(payableId: string, payload: CancelPayablePayload): Promise<Payable> {
    const res = await apiClient.post<ApiEnvelope<Payable>>(
      `/payables/${encodeURIComponent(payableId)}/cancel`,
      payload,
    );
    notify('Conta a pagar cancelada.', 'success', CTX);
    return res.data;
  },

  /** Undo a settlement — reverses the payment posting and reopens the payable. */
  async cancelPayment(
    payableId: string,
    paymentId: string,
    payload: CancelPaymentPayload,
  ): Promise<PayablePayment> {
    const res = await apiClient.post<ApiEnvelope<PayablePayment>>(
      `/payables/${encodeURIComponent(payableId)}/payments/${encodeURIComponent(paymentId)}/cancel`,
      payload,
    );
    notify('Pagamento desfeito.', 'success', CTX);
    return res.data;
  },
};
