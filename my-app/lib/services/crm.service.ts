import { getCookie } from 'cookies-next';
import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * CRM service — wraps the dedicated server-side orchestration endpoints
 * (`/api/crm/pipeline/*`). Business logic for lead transitions lives on the
 * backend (CrmPipelineService); this is a thin typed client over it.
 */

export interface AdvanceStagePayload {
  leadId: string;
  stageId: string;
  stageType?: string;
  meetingAt?: string;
  amount?: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  winProbability?: number;
}

export interface CreateProposalPayload {
  leadId: string;
  amount: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  winProbability?: number;
  estimatedCloseDate?: string;
}

export interface NoShowPayload {
  leadId: string;
  option: 'reschedule' | 'revert';
  rescheduleAt?: string;
  previousStageId?: string;
}

export interface ConvertLeadPayload {
  leadId: string;
  account: {
    name: string;
    segment?: string;
    size?: string;
    website?: string;
    taxId?: string;
    city?: string;
    state?: string;
  };
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    role?: string;
  };
}

/** Advance a first-class opportunity to a target stage (mirror of AdvanceStagePayload). */
export interface AdvanceOpportunityPayload {
  opportunityId: string;
  stageId: string;
  stageType?: string;
  amount?: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  winProbability?: number;
  status?: 'Open' | 'Won' | 'Lost';
}

/** Create an opportunity from a lead (mirror of ConvertLeadPayload). The lead stays Open. */
export interface ConvertLeadToOpportunityPayload {
  leadId: string;
  name: string;
  pipelineId: string;
  stageId?: string;
  amount?: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  accountId?: string;
}

type ApiResult<T = unknown> = { success: boolean; data: T };

/**
 * CRM attachment metadata returned by the file-store endpoints. The binary is
 * never inlined — it is fetched separately via the download endpoint. Kept as a
 * local type (do not import backend types — contract §3 service layer).
 */
export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

/**
 * Base URL + Bearer auth resolution mirroring `apiClient` (api-client.ts). The
 * shared apiClient hard-codes `Content-Type: application/json` and parses every
 * response as text/JSON, so it cannot carry multipart uploads nor blob
 * downloads. The attachment endpoints below therefore use `fetch` directly while
 * reusing the SAME auth mechanism (the `auth_token` cookie → `Authorization`
 * header) and the SAME baseUrl default.
 */
function attachmentBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';
}

function attachmentAuthHeaders(): Record<string, string> {
  const token = getCookie('auth_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${String(token)}`;
  return headers;
}

/**
 * Parse a non-OK fetch response into the standard `{ success, error }` shape so
 * callers can run it through `resolveErrorMessage` (mirrors apiClient's throw).
 */
async function attachmentError(response: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!body.error && !body.message) {
    body.error = `Erro ${response.status}: ${response.statusText}`;
  }
  // Expose the numeric HTTP status so callers can branch on it (e.g. 413/415).
  body.status = response.status;
  return body;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  previousValue?: number;
}

export interface CrmAnalyticsBundle {
  cards: ChartDataPoint[];
  funnel: ChartDataPoint[];
  source: ChartDataPoint[];
  status: ChartDataPoint[];
  bant: ChartDataPoint[];
  proposals: ChartDataPoint[];
  activities: ChartDataPoint[];
}

export type CrmDatePreset = 'today' | 'thisWeek' | 'thisMonth' | 'last30Days' | 'lastMonth' | 'thisYear';

export const CrmService = {
  async getAnalytics(datePreset: CrmDatePreset = 'thisYear'): Promise<ApiResult<CrmAnalyticsBundle>> {
    return apiClient.get<ApiResult<CrmAnalyticsBundle>>(`/crm/pipeline-analytics?datePreset=${encodeURIComponent(datePreset)}`);
  },
  async advanceStage(payload: AdvanceStagePayload): Promise<ApiResult> {
    const res = await apiClient.post<ApiResult>('/crm/pipeline/advance', payload);
    notify('Etapa avançada com sucesso.', 'success', 'CRM');
    return res;
  },
  async createProposal(payload: CreateProposalPayload): Promise<ApiResult> {
    const res = await apiClient.post<ApiResult>('/crm/pipeline/proposal', payload);
    notify('Proposta criada com sucesso.', 'success', 'CRM');
    return res;
  },
  async recordNoShow(payload: NoShowPayload): Promise<ApiResult> {
    const res = await apiClient.post<ApiResult>('/crm/pipeline/no-show', payload);
    notify('No-show registrado.', 'success', 'CRM');
    return res;
  },
  async convertLead(payload: ConvertLeadPayload): Promise<ApiResult> {
    const res = await apiClient.post<ApiResult>('/crm/pipeline/convert-lead', payload);
    notify('Lead convertido com sucesso.', 'success', 'CRM');
    return res;
  },

  /**
   * Advance a first-class opportunity to a target stage via the atomic
   * orchestration endpoint (mirror of `advanceStage`). When `stageType` is a
   * closing stage the backend sets status Won/Lost + closedAt.
   */
  async advanceOpportunity(payload: AdvanceOpportunityPayload): Promise<ApiResult> {
    const res = await apiClient.post<ApiResult>('/crm/pipeline/advance-opportunity', payload);
    notify('Oportunidade avançada com sucesso.', 'success', 'CRM');
    return res;
  },

  /**
   * Create a first-class opportunity from a lead (mirror of `convertLead`). The
   * lead remains Open — opportunity tracking runs in parallel to qualification.
   */
  async convertLeadToOpportunity(payload: ConvertLeadToOpportunityPayload): Promise<ApiResult> {
    const res = await apiClient.post<ApiResult>('/crm/pipeline/convert-lead-to-opportunity', payload);
    notify('Oportunidade criada com sucesso.', 'success', 'CRM');
    return res;
  },

  /**
   * Upload a file as an attachment of a CRM entity (multipart/form-data). Uses
   * `fetch` directly because apiClient cannot send FormData (see above). The
   * browser sets the multipart boundary automatically when the body is FormData,
   * so we deliberately do NOT set a Content-Type header.
   */
  async uploadAttachment(entityType: string, entityId: string, file: File): Promise<ApiResult<AttachmentMeta>> {
    const form = new FormData();
    form.append('file', file);
    form.append('entityType', entityType);
    form.append('entityId', entityId);

    const response = await fetch(`${attachmentBaseUrl()}/crm/attachments`, {
      method: 'POST',
      headers: attachmentAuthHeaders(),
      body: form,
    });

    if (!response.ok) throw await attachmentError(response);
    const res = (await response.json()) as ApiResult<AttachmentMeta>;
    notify('Arquivo anexado com sucesso.', 'success', 'CRM');
    return res;
  },

  /**
   * List attachments of a CRM entity. Read-only JSON — routed through apiClient
   * for consistent auth/error handling.
   */
  async listAttachments(entityType: string, entityId: string): Promise<{ success: boolean; data: AttachmentMeta[] }> {
    return apiClient.get<{ success: boolean; data: AttachmentMeta[] }>(
      `/crm/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    );
  },

  async deleteAttachment(id: string): Promise<ApiResult> {
    const res = await apiClient.delete<ApiResult>(`/crm/attachments/${encodeURIComponent(id)}`);
    notify('Anexo removido.', 'success', 'CRM');
    return res;
  },

  /**
   * Download an attachment as a blob and trigger a browser download. Uses `fetch`
   * because apiClient parses every response as text/JSON and cannot return a
   * blob. Same Bearer auth as apiClient. Creates a transient object URL on a
   * temporary <a download> element, clicks it, then revokes the URL.
   */
  async downloadAttachment(id: string, fileName: string): Promise<void> {
    const response = await fetch(`${attachmentBaseUrl()}/crm/attachments/${encodeURIComponent(id)}/download`, {
      method: 'GET',
      headers: attachmentAuthHeaders(),
    });

    if (!response.ok) throw await attachmentError(response);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || 'download';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
