export interface WidgetDimensions {
  W: number;
  H: number;
  MIN_W: number;
  MIN_H: number;
}

export interface DashboardGridItem {
  i: string;
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  widgetConfig?: any;
}

export interface DashboardLayout {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  type: string;
  config: {
    positions?: DashboardGridItem[];
    columns?: number;
    widgets?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardGridConfig {
  WIDGET_TYPES: {
    [key: string]: string;
    CHAT: string;
    DOCUMENT_CHAT: string;
    GENERIC_CHAT: string;
    KPI: string;
  };
  DIMENSIONS: {
    [key: string]: WidgetDimensions;
    DEFAULT: WidgetDimensions;
    CHAT: WidgetDimensions;
  };
  GRID: {
    BREAKPOINTS: Record<string, number>;
    COLS: Record<string, number>;
    ROW_HEIGHT: number;
    MARGIN: [number, number];
    PADDING: [number, number];
  };
}

export enum ItemActionType {
  ADD_WIDGET = 'ADD_WIDGET',
  UPDATE_WIDGET_LAYOUT = 'UPDATE_WIDGET_LAYOUT',
  UPDATE_WIDGET_CONFIG = 'UPDATE_WIDGET_CONFIG',
  REMOVE_WIDGET = 'REMOVE_WIDGET',
  SET_LAYOUT = 'SET_LAYOUT',
  OPTIMIZE_LAYOUT = 'OPTIMIZE_LAYOUT'
}

export interface ItemAction {
  type: ItemActionType;
  payload: {
    widgetType?: string;
    droppedX?: number;
    droppedY?: number;
    newLayout?: DashboardGridItem[];
    itemId?: string;
    config?: any;
    layoutItems?: DashboardGridItem[];
  };
}

// Tipos para Drag and Drop
export const ItemTypes = {
  WIDGET: 'widget',
} as const;

export interface DraggableItem {
  type: string;
  // Adicione outras propriedades necessárias
}

export interface DropResult {
  x: number;
  y: number;
}

export interface UseDashboardGridProps {
  initialItems?: DashboardGridItem[];
  onLayoutChange?: (layout: DashboardGridItem[]) => void;
}
