'use client';

import { useCallback, useReducer } from 'react';
import {
  DashboardGridItem,
  ItemAction,
  ItemActionType,
  WidgetDimensions
} from '../types/dashboard-grid.types';
import { DASHBOARD_GRID_CONFIG } from '../dashboard-grid.config';
import {
  generateWidgetId,
  getWidgetDimensions
} from '../utils/dashboard-grid.utils';

// Constantes
const INITIAL_STATE: DashboardGridItem[] = [];

// Função auxiliar para criar um novo item
function createNewItem(
  widgetType: string,
  dimensions: WidgetDimensions,
  existingItems: DashboardGridItem[] = [],
  position?: { x: number; y: number }
): DashboardGridItem {
  const id = generateWidgetId();
  return {
    id,
    i: id,
    type: widgetType,
    x: position?.x ?? 0,
    y: position?.y ?? Infinity, // Padrão para o fundo para que o grid encontre a posição
    w: dimensions.W,
    h: dimensions.H,
    minW: dimensions.MIN_W,
    minH: dimensions.MIN_H,
    isDraggable: true,
    isResizable: true
  };
}

// Reducer principal
function itemsReducer(state: DashboardGridItem[], action: ItemAction): DashboardGridItem[] {
  switch (action.type) {
    case ItemActionType.ADD_WIDGET: {
      if (!action.payload.widgetType) return state;

      const { widgetType, droppedX, droppedY } = action.payload;
      const dimensions = getWidgetDimensions(widgetType);

      const position = (droppedX !== undefined && droppedY !== undefined)
        ? { x: droppedX, y: droppedY }
        : undefined;

      const newItem = createNewItem(widgetType, dimensions, state, position);

      return [...state, newItem];
    }

    case ItemActionType.UPDATE_WIDGET_LAYOUT: {
      if (!action.payload.newLayout) return state;
      return action.payload.newLayout;
    }

    case ItemActionType.UPDATE_WIDGET_CONFIG: {
      if (!action.payload.itemId || action.payload.config === undefined) return state;
      return state.map(item =>
        item.id === action.payload.itemId
          ? { ...item, widgetConfig: action.payload.config }
          : item
      );
    }

    case ItemActionType.REMOVE_WIDGET: {
      if (!action.payload.itemId) return state;
      return state.filter(item => item.id !== action.payload.itemId);
    }

    case ItemActionType.SET_LAYOUT: {
      if (!action.payload.layoutItems) return state;
      return action.payload.layoutItems;
    }



    default:
      return state;
  }
}

interface UseDashboardGridReturn {
  items: DashboardGridItem[];
  updateLayout: (newLayout: DashboardGridItem[]) => void;
  setLayout: (newItems: DashboardGridItem[]) => void;
  addWidget: (type: string, position?: { x: number; y: number }) => boolean;
  removeWidget: (itemId: string) => void;
  updateWidgetConfig: (itemId: string, config: any) => void;
}

function useDashboardGrid({
  initialItems = []
}: {
  initialItems?: DashboardGridItem[]
} = {}): UseDashboardGridReturn {
  const [items, dispatch] = useReducer(itemsReducer, initialItems);

  const updateLayout = useCallback(function updateLayout(newLayout: DashboardGridItem[]) {
    dispatch({
      type: ItemActionType.UPDATE_WIDGET_LAYOUT,
      payload: { newLayout }
    });
  }, []);

  const setLayout = useCallback(function setLayout(newItems: DashboardGridItem[]) {
    dispatch({
      type: ItemActionType.SET_LAYOUT,
      payload: { layoutItems: newItems }
    });
  }, []);

  const addWidget = useCallback(function addWidget(
    type: string,
    position?: { x: number; y: number }
  ): boolean {
    dispatch({
      type: ItemActionType.ADD_WIDGET,
      payload: {
        widgetType: type,
        ...(position && {
          droppedX: Math.max(0, position.x),
          droppedY: Math.max(0, position.y)
        })
      }
    });
    return true;
  }, []);

  const removeWidget = useCallback(function removeWidget(itemId: string) {
    dispatch({
      type: ItemActionType.REMOVE_WIDGET,
      payload: { itemId }
    });
  }, []);

  const updateWidgetConfig = useCallback(function updateWidgetConfig(itemId: string, config: any) {
    dispatch({
      type: ItemActionType.UPDATE_WIDGET_CONFIG,
      payload: { itemId, config }
    });
  }, []);

  return {
    items,
    updateLayout,
    setLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
  };
}

export default useDashboardGrid;
export type { UseDashboardGridReturn };
