import { apiClient } from '../api/api-client';

interface AnalyticsDataResponse { rows?: unknown[]; schema?: unknown; [key: string]: unknown }
interface SidebarResponse { tables?: unknown[]; [key: string]: unknown }
interface SystemStatusResponse { status?: string; [key: string]: unknown }

export const AnalyticsService = {
  async getDiscoverData(tableId: string, queryParams: string = ''): Promise<AnalyticsDataResponse> {
    const search = queryParams ? `?${queryParams}` : '';
    return apiClient.get(`/analytics/discover/${encodeURIComponent(tableId)}${search}`);
  },

  async getDrillDownData(queryParams: string): Promise<AnalyticsDataResponse> {
    return apiClient.get(`/analytics/drill-down?${queryParams}`);
  },

  async getDashboardSidebar(): Promise<SidebarResponse> {
    return apiClient.get('/dashboard/sidebar');
  },

  async getSystemStatus(): Promise<SystemStatusResponse> {
    return apiClient.get('/dashboard/system');
  }
};
