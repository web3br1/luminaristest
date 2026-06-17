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

type ApiResult<T = unknown> = { success: boolean; data: T };

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
};
