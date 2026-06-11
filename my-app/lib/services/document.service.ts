import { apiClient } from '../api/api-client';

export const DocumentService = {
  async getDocuments(): Promise<any> {
    return apiClient.get('/documents');
  },

  async getDocumentById(docId: string): Promise<any> {
    return apiClient.get(`/documents/${docId}`);
  },

  async uploadDocument(formData: FormData): Promise<any> {
    // Note: FormData requires a different content-type or letting browser set it
    // The apiClient defaults to application/json. We might need a generic or custom method 
    // for multipart/form-data. For now, assuming the interceptor handles it if we pass headers
    // or we might need to adjust the apiClient for file uploads.
    // We will bypass apiClient exclusively for FormData uploads if it forces JSON, 
    // or pass custom headers. Let's pass an empty content-type so browser sets boundary.
    const token = typeof window !== 'undefined' ? document.cookie.split('auth_token=')[1]?.split(';')[0] : '';
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) throw await response.json();
    return response.json();
  },

  async getTokenCost(formData: FormData): Promise<any> {
    const token = typeof window !== 'undefined' ? document.cookie.split('auth_token=')[1]?.split(';')[0] : '';
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/documents/token-cost`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) throw await response.json();
    return response.json();
  },

  async getQdrantStatus(): Promise<any> {
    return apiClient.get('/documents/qdrant-status');
  },

  async getQdrantPoints(docId: string): Promise<any> {
    return apiClient.get(`/documents/${docId}/qdrant`);
  },

  async triggerQdrantInjection(docId: string): Promise<any> {
    return apiClient.post(`/documents/${docId}/qdrant`, {});
  },

  async deleteDocument(docId: string): Promise<any> {
    return apiClient.delete(`/documents/${docId}`);
  }
};
