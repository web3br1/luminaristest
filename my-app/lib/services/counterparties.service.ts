import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * Counterparty (Contraparte — fornecedor/cliente) service — thin typed client over
 * the catalog endpoints (`/api/counterparties/*`). FIRST-CLASS Prisma catalog on the
 * backend (CounterpartyService, INCR-COUNTERPARTY / A1); this only shapes requests/
 * responses. A counterparty carries NO money and NO dates — it is a stable identity
 * that the AP/AR subledger links to by FK (`counterpartyId`), so posição por contraparte
 * groups by a rename-safe key instead of the display-name snapshot.
 */

const CTX = 'Contrapartes';

/** The standard server response envelope: { success, data }. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// ── Domain types ───────────────────────────────────────────────────────────────
/** SUPPLIER = the AP (fornecedor) side; CUSTOMER = the AR (cliente) side. */
export type CounterpartyType = 'SUPPLIER' | 'CUSTOMER';

export const COUNTERPARTY_TYPES: readonly CounterpartyType[] = ['SUPPLIER', 'CUSTOMER'];

export interface Counterparty {
  id: string;
  userId: string;
  unitId: string;
  type: CounterpartyType;
  name: string;
  /** OPTIONAL scoped ref to a DynamicTable row (plain string, not a FK). */
  ref: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when archived (soft-delete). */
  deletedAt: string | null;
}

// ── Request payloads ─────────────────────────────────────────────────────────────
export interface ListCounterpartiesQuery {
  unitId: string;
  /** Filter by kind (SUPPLIER for AP, CUSTOMER for AR). */
  type?: CounterpartyType;
  includeArchived?: boolean;
}

export interface CreateCounterpartyPayload {
  unitId: string;
  type: CounterpartyType;
  name: string;
  ref?: string;
}

/** Build a `?a=x&b=y` query string, dropping undefined/empty values and encoding. */
function buildQuery(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const counterpartiesService = {
  /** List counterparties for a unit (optionally filtered by type), read-only. */
  async listCounterparties(query: ListCounterpartiesQuery): Promise<Counterparty[]> {
    const qs = buildQuery({
      unitId: query.unitId,
      type: query.type,
      includeArchived: query.includeArchived ? 'true' : undefined,
    });
    const res = await apiClient.get<ApiEnvelope<Counterparty[]>>(`/counterparties${qs}`);
    return res.data;
  },

  /** Create a supplier/customer (catalog command). */
  async createCounterparty(payload: CreateCounterpartyPayload): Promise<Counterparty> {
    const res = await apiClient.post<ApiEnvelope<Counterparty>>('/counterparties', payload);
    notify('Contraparte cadastrada.', 'success', CTX);
    return res.data;
  },

  /** Soft-archive a counterparty (frees the name for reuse). Historical AP/AR links stay intact. */
  async archiveCounterparty(id: string, unitId: string): Promise<Counterparty> {
    const res = await apiClient.post<ApiEnvelope<Counterparty>>(
      `/counterparties/${encodeURIComponent(id)}/archive`,
      { unitId },
    );
    notify('Contraparte arquivada.', 'success', CTX);
    return res.data;
  },
};
