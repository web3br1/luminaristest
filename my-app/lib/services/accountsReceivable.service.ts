import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * Accounts Receivable (Contas a Receber) service — thin typed client over the AR
 * command endpoints (`/api/receivables/*`). All invariants (double-entry recognition/
 * receipt, period gate, status CAS, full-receipt rule) live on the backend
 * (ReceivableService); this only shapes requests/responses. Money is INTEGER CENTS
 * end to end; date fields are `YYYY-MM-DD` strings. MIRROR of accountsPayable.service.
 */

const CTX = 'Contas a Receber';

/** The standard server response envelope: { success, data }. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// ── Domain types ───────────────────────────────────────────────────────────────
export type ReceivableStatus = 'OPEN' | 'RECEIVING' | 'RECEIVED' | 'CANCELLED';
export type ReceiptMethod = 'Cash' | 'Pix' | 'TED' | 'Boleto';
export type ReceiptStatus = 'ACTIVE' | 'CANCELLED';

export const RECEIPT_METHODS: readonly ReceiptMethod[] = ['Cash', 'Pix', 'TED', 'Boleto'];

export interface ReceivableReceipt {
  id: string;
  userId: string;
  unitId: string;
  receivableId: string;
  amountCents: number;
  method: ReceiptMethod;
  receivedAt: string;
  receivedByUserId: string | null;
  status: ReceiptStatus;
  entryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Receivable {
  id: string;
  userId: string;
  unitId: string;
  customerName: string;
  customerRef: string | null;
  documentNumber: string | null;
  description: string;
  issueDate: string;
  dueDate: string;
  amountCents: number;
  revenueAccountId: string;
  status: ReceivableStatus;
  createdById: string | null;
  cancelledById: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** List/get reads embed the receipt history. */
export interface ReceivableWithReceipts extends Receivable {
  receipts: ReceivableReceipt[];
}

// ── Request payloads ─────────────────────────────────────────────────────────────
export interface ListReceivablesQuery {
  unitId: string;
  status?: ReceivableStatus;
  page?: number;
  limit?: number;
}

export interface CreateReceivablePayload {
  unitId: string;
  customerName: string;
  customerRef?: string;
  documentNumber?: string;
  description: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  amountCents: number;
  /** Chart-of-accounts account **id** (analytic, nature=Revenue). */
  revenueAccountId: string;
  attachmentId?: string;
}

export interface RegisterReceiptPayload {
  unitId: string;
  method: ReceiptMethod;
  /** YYYY-MM-DD — effective bank-credit date. */
  receivedAt: string;
  /** Must equal the full remaining balance (partial receipt not supported). */
  amountCents: number;
}

export interface CancelReceivablePayload {
  unitId: string;
  /** YYYY-MM-DD — gates on the period this date belongs to. */
  reversalDate: string;
  reason?: string;
}

export interface CancelReceiptPayload {
  unitId: string;
  /** YYYY-MM-DD */
  reversalDate: string;
  reason?: string;
}

export interface ListReceivablesResult {
  receivables: ReceivableWithReceipts[];
  total: number;
}

/** Build a `?a=x&b=y` query string, dropping undefined/empty values and encoding. */
function buildQuery(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const accountsReceivableService = {
  /** List receivables for a unit (paginated, receipt history embedded), read-only. */
  async listReceivables(query: ListReceivablesQuery): Promise<ListReceivablesResult> {
    const qs = buildQuery({
      unitId: query.unitId,
      status: query.status,
      page: query.page !== undefined ? String(query.page) : undefined,
      limit: query.limit !== undefined ? String(query.limit) : undefined,
    });
    const res = await apiClient.get<ApiEnvelope<ListReceivablesResult>>(`/receivables${qs}`);
    return res.data;
  },

  /** Create a receivable — books the recognition posting (D clientes / C receita). */
  async createReceivable(payload: CreateReceivablePayload): Promise<Receivable> {
    const res = await apiClient.post<ApiEnvelope<Receivable>>('/receivables', payload);
    notify('Conta a receber registrada.', 'success', CTX);
    return res.data;
  },

  /** Register the (full) receipt — books the receipt (D banco / C clientes) → RECEIVED. */
  async registerReceipt(receivableId: string, payload: RegisterReceiptPayload): Promise<ReceivableReceipt> {
    const res = await apiClient.post<ApiEnvelope<ReceivableReceipt>>(
      `/receivables/${encodeURIComponent(receivableId)}/receive`,
      payload,
    );
    notify('Recebimento registrado.', 'success', CTX);
    return res.data;
  },

  /** Cancel an OPEN receivable — reverses the recognition posting. */
  async cancelReceivable(receivableId: string, payload: CancelReceivablePayload): Promise<Receivable> {
    const res = await apiClient.post<ApiEnvelope<Receivable>>(
      `/receivables/${encodeURIComponent(receivableId)}/cancel`,
      payload,
    );
    notify('Conta a receber cancelada.', 'success', CTX);
    return res.data;
  },

  /** Undo a receipt — reverses the receipt posting and reopens the receivable. */
  async cancelReceipt(
    receivableId: string,
    receiptId: string,
    payload: CancelReceiptPayload,
  ): Promise<ReceivableReceipt> {
    const res = await apiClient.post<ApiEnvelope<ReceivableReceipt>>(
      `/receivables/${encodeURIComponent(receivableId)}/receipts/${encodeURIComponent(receiptId)}/cancel`,
      payload,
    );
    notify('Recebimento desfeito.', 'success', CTX);
    return res.data;
  },
};
