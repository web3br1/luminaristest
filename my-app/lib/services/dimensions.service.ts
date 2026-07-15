import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * Dimensões (INCR-DIM) service — thin typed client over `/api/dimensions/*`. A dimension is an
 * ORTHOGONAL label on a posting leg (ACC-024): metadata, never money. The catalog is first-class
 * Prisma — a DEFINITION is an axis (cost center, project), a VALUE is a node in that axis's tree
 * (parentId rollup). All invariants (leaf-only tagging, one value per axis, archive order, rollup)
 * live on the backend; this only shapes requests/responses. Money in reports is INTEGER CENTS.
 */

const CTX = 'Dimensões';

/** The standard server response envelope: { success, data }. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// ── Catalog domain types (mirror the Prisma rows the backend returns) ──────────
export type DimensionStatus = 'ACTIVE' | 'ARCHIVED';

export interface DimensionDefinition {
  id: string;
  userId: string;
  unitId: string;
  code: string;
  name: string;
  status: DimensionStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DimensionValue {
  id: string;
  userId: string;
  unitId: string;
  definitionId: string;
  code: string;
  name: string;
  parentId: string | null;
  status: DimensionStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A definition with its values (flat list carrying parentId — the tree is in the data). */
export interface DimensionCatalogEntry {
  definition: DimensionDefinition;
  values: DimensionValue[];
}

// ── Report shapes (money in INTEGER CENTS — number) ────────────────────────────
export interface DimensionBalanceAccountRow {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
}

export interface DimensionBalanceBucket {
  valueId: string | null; // null = "(sem dimensão)"
  valueCode: string | null;
  valueName: string;
  parentId: string | null;
  ownDebitCents: number;
  ownCreditCents: number;
  ownBalanceCents: number;
  rollupDebitCents: number;
  rollupCreditCents: number;
  rollupBalanceCents: number;
  accounts: DimensionBalanceAccountRow[];
}

export interface DimensionBalanceReport {
  unitId: string;
  definitionId: string;
  definitionCode: string;
  definitionName: string;
  from: string | null;
  to: string | null;
  buckets: DimensionBalanceBucket[];
  totals: { debitCents: number; creditCents: number; balanceCents: number };
}

export interface DimensionResultBucket {
  valueId: string | null;
  valueCode: string | null;
  valueName: string;
  parentId: string | null;
  ownRevenueCents: number;
  ownExpenseCents: number;
  ownResultCents: number;
  rollupRevenueCents: number;
  rollupExpenseCents: number;
  rollupResultCents: number;
}

export interface DimensionResultReport {
  unitId: string;
  definitionId: string;
  definitionCode: string;
  definitionName: string;
  from: string | null;
  to: string | null;
  buckets: DimensionResultBucket[];
  totals: { revenueCents: number; expenseCents: number; resultCents: number };
}

// ── Request payloads ───────────────────────────────────────────────────────────
export interface ListDimensionsQuery {
  unitId: string;
  includeArchived?: boolean;
}

export interface CreateDefinitionPayload {
  unitId: string;
  code: string;
  name: string;
}

export interface CreateValuePayload {
  unitId: string;
  definitionId: string;
  code: string;
  name: string;
  parentId?: string;
}

export interface DimensionReportQuery {
  unitId: string;
  definitionId: string;
  from?: string;
  to?: string;
}

/** Build a `?a=x&b=y` query string, dropping undefined/empty values and encoding. */
function buildQuery(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const dimensionsService = {
  /** The catalog: definitions + their values (values carry parentId → build the tree client-side). */
  async listCatalog(query: ListDimensionsQuery): Promise<DimensionCatalogEntry[]> {
    const qs = buildQuery({
      unitId: query.unitId,
      includeArchived: query.includeArchived ? 'true' : undefined,
    });
    const res = await apiClient.get<ApiEnvelope<DimensionCatalogEntry[]>>(`/dimensions${qs}`);
    return res.data;
  },

  /** Create a dimension axis (cost center, project…). */
  async createDefinition(payload: CreateDefinitionPayload): Promise<DimensionDefinition> {
    const res = await apiClient.post<ApiEnvelope<DimensionDefinition>>('/dimensions/definitions', payload);
    notify('Eixo de dimensão criado.', 'success', CTX);
    return res.data;
  },

  /** Archive an axis — its values must be archived first (the backend 400s otherwise). */
  async archiveDefinition(id: string, unitId: string): Promise<DimensionDefinition> {
    const res = await apiClient.post<ApiEnvelope<DimensionDefinition>>(
      `/dimensions/definitions/${encodeURIComponent(id)}/archive`,
      { unitId },
    );
    notify('Eixo arquivado.', 'success', CTX);
    return res.data;
  },

  /** Create a value in an axis (optional rollup parent, same axis). */
  async createValue(payload: CreateValuePayload): Promise<DimensionValue> {
    const res = await apiClient.post<ApiEnvelope<DimensionValue>>('/dimensions/values', payload);
    notify('Valor de dimensão criado.', 'success', CTX);
    return res.data;
  },

  /** Archive a value — its children must be archived first (the backend 400s otherwise). */
  async archiveValue(id: string, unitId: string): Promise<DimensionValue> {
    const res = await apiClient.post<ApiEnvelope<DimensionValue>>(
      `/dimensions/values/${encodeURIComponent(id)}/archive`,
      { unitId },
    );
    notify('Valor arquivado.', 'success', CTX);
    return res.data;
  },

  /** Balancete por dimensão — read-only, no notification. */
  async balanceByDimension(query: DimensionReportQuery): Promise<DimensionBalanceReport> {
    const qs = buildQuery({ unitId: query.unitId, definitionId: query.definitionId, from: query.from, to: query.to });
    const res = await apiClient.get<ApiEnvelope<DimensionBalanceReport>>(`/dimensions/reports/balance${qs}`);
    return res.data;
  },

  /** DRE por dimensão — read-only, no notification. */
  async resultByDimension(query: DimensionReportQuery): Promise<DimensionResultReport> {
    const qs = buildQuery({ unitId: query.unitId, definitionId: query.definitionId, from: query.from, to: query.to });
    const res = await apiClient.get<ApiEnvelope<DimensionResultReport>>(`/dimensions/reports/result${qs}`);
    return res.data;
  },
};
