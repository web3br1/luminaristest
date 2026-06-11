import { DashboardGridConfig } from './types/dashboard-grid.types';

export const DASHBOARD_GRID_CONFIG: DashboardGridConfig = {
  WIDGET_TYPES: {
    CHAT: 'chat', // Legacy - mantido para compatibilidade
    DOCUMENT_CHAT: 'document-chat', // Chat para documentos vetorizados (Qdrant)
    GENERIC_CHAT: 'generic-chat', // Chat genérico expansível
    KPI: 'kpi', // Widget para KPIs do motor de Analytics
    ERP_VIEW: 'erp-view' // Visualização embutida de uma tabela do ERP
  },
  DIMENSIONS: {
    DEFAULT: { W: 4, H: 6, MIN_W: 2, MIN_H: 2 },
    CHAT: { W: 6, H: 20, MIN_W: 2, MIN_H: 10 },
    GENERIC_CHAT: { W: 6, H: 24, MIN_W: 2, MIN_H: 10 },
    KPI: { W: 4, H: 10, MIN_W: 2, MIN_H: 6 },
    ERP_VIEW: { W: 12, H: 14, MIN_W: 6, MIN_H: 8 }
  },
  GRID: {
    BREAKPOINTS: { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 },
    COLS: { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 },
    ROW_HEIGHT: 30,
    MARGIN: [12, 12] as [number, number],
    PADDING: [12, 12] as [number, number]
  }
} as const;
