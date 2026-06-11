import { apiClient } from '../api/api-client';

export const AnalyticsService = {
  async getDiscoverData(tableId: string, queryParams: string = ''): Promise<any> {
    const search = queryParams ? `?${queryParams}` : '';
    return apiClient.get(`/analytics/discover/${encodeURIComponent(tableId)}${search}`);
  },

  async getDrillDownData(queryParams: string): Promise<any> {
    return apiClient.get(`/analytics/drill-down?${queryParams}`);
  },

  async getDashboardSidebar(): Promise<any> {
    return apiClient.get('/dashboard/sidebar');
  },

  async getSystemStatus(): Promise<any> {
    return apiClient.get('/dashboard/system');
  }
};
