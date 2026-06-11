import { DashboardGridItem } from '../types/dashboard-grid.types';
import { DASHBOARD_GRID_CONFIG } from '../dashboard-grid.config';

function generateWidgetId(length = 6): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

function validateDimensions(
  width: number,
  height: number,
  minWidth: number,
  minHeight: number,
  maxWidth = 12,
  maxHeight = 20
): { w: number; h: number } {
  return {
    w: Math.max(minWidth, Math.min(width, maxWidth)),
    h: Math.max(minHeight, Math.min(height, maxHeight))
  };
}



function getWidgetDimensions(widgetType: string) {
  switch (widgetType) {
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.CHAT:
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.DOCUMENT_CHAT:
    case 'document-chat':
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.CHAT;
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.GENERIC_CHAT:
    case 'generic-chat':
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.GENERIC_CHAT;
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.KPI:
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.KPI;
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.ERP_VIEW:
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.ERP_VIEW;
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.CHART:
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.CHART;
    case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.SPREADSHEET:
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.SPREADSHEET;
    default:
      return DASHBOARD_GRID_CONFIG.DIMENSIONS.DEFAULT;
  }
}

export {
  generateWidgetId,
  validateDimensions,
  getWidgetDimensions
};
