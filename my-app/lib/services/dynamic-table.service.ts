import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

interface TableMeta { id: string; name?: string; columns?: unknown[]; [key: string]: unknown }
interface TableListResponse { data: TableMeta[]; success?: boolean; [key: string]: unknown }
interface TableDataResponse { data?: unknown[]; total?: number; page?: number; [key: string]: unknown }
interface RecordResponse { id?: string; [key: string]: unknown }
interface LookupResponse { results?: unknown[]; [key: string]: unknown }
interface SidebarResponse { tables?: unknown[]; [key: string]: unknown }
interface SystemResponse { status?: string; [key: string]: unknown }

export const DynamicTableService = {
  // --- Table Meta ---
  async getTables(): Promise<TableListResponse> {
    return apiClient.get('/dynamic-tables');
  },
  async getTableById(tableId: string): Promise<TableMeta> {
    return apiClient.get(`/dynamic-tables/${tableId}`);
  },
  async getSubTables(parentId: string): Promise<TableListResponse> {
    return apiClient.get(`/dynamic-tables?parentTableId=${parentId}`);
  },
  async createTable(payload: Record<string, unknown>): Promise<TableMeta> {
    return apiClient.post('/dynamic-tables', payload);
  },

  // --- Table Data (Records) ---
  async getTableData(tableId: string, queryParams: string = ''): Promise<TableDataResponse> {
    const url = queryParams ? `/dynamic-tables/${tableId}/data?${queryParams}` : `/dynamic-tables/${tableId}/data`;
    return apiClient.get(url);
  },
  async getRecordById(tableId: string, recordId: string): Promise<RecordResponse> {
    return apiClient.get(`/dynamic-tables/${tableId}/data/${recordId}`);
  },
  async createRecord(tableId: string, payload: Record<string, unknown>, options?: { successMessage?: string | null }): Promise<RecordResponse> {
    const result = await apiClient.post<RecordResponse>(`/dynamic-tables/${tableId}/data`, payload);
    const msg = options?.successMessage !== undefined
      ? options.successMessage
      : 'Registro criado com sucesso.';
    if (msg) notify(msg, 'success', 'Sucesso');
    return result;
  },
  async updateRecord(tableId: string, recordId: string, payload: Record<string, unknown>, options?: { successMessage?: string | null }): Promise<RecordResponse> {
    const result = await apiClient.put<RecordResponse>(`/dynamic-tables/${tableId}/data/${recordId}`, payload);
    const msg = options?.successMessage !== undefined
      ? options.successMessage
      : 'Registro atualizado com sucesso.';
    if (msg) notify(msg, 'success', 'Sucesso');
    return result;
  },
  async deleteRecord(tableId: string, recordId: string, options?: { successMessage?: string | null }): Promise<unknown> {
    const result = await apiClient.delete(`/dynamic-tables/${tableId}/data/${recordId}`);
    const msg = options?.successMessage !== undefined
      ? options.successMessage
      : 'Registro excluído com sucesso.';
    if (msg) notify(msg, 'success', 'Sucesso');
    return result;
  },
  async performLookup(payload: { targetTableId: string; displayField: string; keys: string[] }): Promise<LookupResponse> {
    return apiClient.post('/dynamic-tables/lookup', payload as Record<string, unknown>);
  },

  // --- Dashboard Specific Layouts ---
  async getSidebar(): Promise<SidebarResponse> {
    return apiClient.get('/dashboard/sidebar');
  },
  async getSystem(): Promise<SystemResponse> {
    return apiClient.get('/dashboard/system');
  },
  async deleteSystem(): Promise<unknown> {
    return apiClient.delete('/dashboard/system');
  },
  // --- Generic ---
  async getCustomData(url: string): Promise<unknown> {
    return apiClient.get(url);
  }
};
