import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

export const DynamicTableService = {
  // --- Table Meta ---
  async getTables(): Promise<any> {
    return apiClient.get('/dynamic-tables');
  },
  async getTableById(tableId: string): Promise<any> {
    return apiClient.get(`/dynamic-tables/${tableId}`);
  },
  async getSubTables(parentId: string): Promise<any> {
    return apiClient.get(`/dynamic-tables?parentTableId=${parentId}`);
  },
  async createTable(payload: any): Promise<any> {
    return apiClient.post('/dynamic-tables', payload);
  },

  // --- Table Data (Records) ---
  async getTableData(tableId: string, queryParams: string = ''): Promise<any> {
    const url = queryParams ? `/dynamic-tables/${tableId}/data?${queryParams}` : `/dynamic-tables/${tableId}/data`;
    return apiClient.get(url);
  },
  async getRecordById(tableId: string, recordId: string): Promise<any> {
    return apiClient.get(`/dynamic-tables/${tableId}/data/${recordId}`);
  },
  async createRecord(tableId: string, payload: any, options?: { successMessage?: string | null }): Promise<any> {
    const result = await apiClient.post(`/dynamic-tables/${tableId}/data`, payload);
    const msg = options?.successMessage !== undefined
      ? options.successMessage
      : 'Registro criado com sucesso.';
    if (msg) notify(msg, 'success', 'Sucesso');
    return result;
  },
  async updateRecord(tableId: string, recordId: string, payload: any, options?: { successMessage?: string | null }): Promise<any> {
    const result = await apiClient.put(`/dynamic-tables/${tableId}/data/${recordId}`, payload);
    const msg = options?.successMessage !== undefined
      ? options.successMessage
      : 'Registro atualizado com sucesso.';
    if (msg) notify(msg, 'success', 'Sucesso');
    return result;
  },
  async deleteRecord(tableId: string, recordId: string, options?: { successMessage?: string | null }): Promise<any> {
    const result = await apiClient.delete(`/dynamic-tables/${tableId}/data/${recordId}`);
    const msg = options?.successMessage !== undefined
      ? options.successMessage
      : 'Registro excluído com sucesso.';
    if (msg) notify(msg, 'success', 'Sucesso');
    return result;
  },
  async performLookup(payload: { targetTableId: string; displayField: string; keys: string[] }): Promise<any> {
    return apiClient.post('/dynamic-tables/lookup', payload);
  },

  // --- Dashboard Specific Layouts ---
  async getSidebar(): Promise<any> {
    return apiClient.get('/dashboard/sidebar');
  },
  async getSystem(): Promise<any> {
    return apiClient.get('/dashboard/system');
  },
  async deleteSystem(): Promise<any> {
    return apiClient.delete('/dashboard/system');
  },
  // --- Generic ---
  async getCustomData(url: string): Promise<any> {
    return apiClient.get(url);
  }
};
