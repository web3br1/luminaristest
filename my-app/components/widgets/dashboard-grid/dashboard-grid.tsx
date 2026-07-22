'use client';

import React, { ReactNode, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
// Persistência de chat removida

import { useAuth } from '@/lib/context/AuthContext';
import DocumentChatWidget from '../chat/components/DocumentChatWidget';
import GenericChatWidget from '../generic-chat/components/GenericChatWidget';
import AnalyticsWidget from '../analytics/AnalyticsWidget';
import ErpViewWidget from '../erp-view/ErpViewWidget';
import { DASHBOARD_GRID_CONFIG } from './dashboard-grid.config';
import useDashboardGrid from './hooks/use-dashboard-grid';
import { DocumentOption } from '../chat/components/DocumentSelector';
import { DashboardGridItem, DashboardLayout } from './types/dashboard-grid.types';
import { DashboardLayoutApi } from './dashboard-layout.api';
import DashboardTabsBar from './DashboardTabsBar';
import FloatingAddWidgetButton from './FloatingAddWidgetButton';
import { getWidgetDimensions } from './utils/dashboard-grid.utils';

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function DashboardGrid() {
  const { user } = useAuth();
  const { items, updateLayout, addWidget, removeWidget, setLayout, updateWidgetConfig } = useDashboardGrid();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);

  // Multi-layout (tabs) state.
  const [layouts, setLayouts] = useState<DashboardLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  // Suppresses the auto-save effect when items change due to a programmatic load/switch.
  const switchingRef = useRef(false);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const [activeChatInstanceIds, setActiveChatInstanceIds] = useState<Set<string>>(new Set());
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentOption[]>([]);
  const [activeSpreadsheetDocumentId, setActiveSpreadsheetDocumentId] = useState<string | null>(null);
  const [lastAssistantMessage, setLastAssistantMessage] = useState<{ chatInstanceId: string; message: string; timestamp: number } | null>(null);

  // --- Dynamic maxRows: Prevent widgets from exceeding the viewport ---
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const measure = () => setContainerHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxRows = useMemo(() => {
    if (!containerHeight) return 100; // fallback
    const rowH = DASHBOARD_GRID_CONFIG.GRID.ROW_HEIGHT;
    const marginY = DASHBOARD_GRID_CONFIG.GRID.MARGIN[1];
    // Each row occupies rowHeight + marginY, minus one margin at the end
    return Math.floor((containerHeight + marginY) / (rowH + marginY));
  }, [containerHeight]);
  // Estados relacionados à persistência de chat foram removidos

  useEffect(function loadLayoutsOnMount() {
    async function loadLayouts() {
      try {
        setIsLoading(true);
        setError(null);

        let list = await DashboardLayoutApi.list();

        // First-time user: create a default tab.
        if (list.length === 0) {
          const created = await DashboardLayoutApi.create('Dashboard', { positions: [], columns: 12, widgets: [] });
          list = [created];
        }

        const active = list.find(l => l.isActive) ?? list[0];
        setLayouts(list);
        setActiveLayoutId(active.id);
        switchingRef.current = true; // this is a programmatic load, not a user edit
        setLayout(active.config.positions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    if (user) {
      loadLayouts();
    }
  }, [user, setLayout]);

  useEffect(function saveLayoutOnChange() {
    // Skip during initial load, on error, or with no active tab.
    if (isInitialMount.current || isLoading || !!error || !activeLayoutId) {
      if (!isLoading) isInitialMount.current = false;
      return;
    }

    // Skip the save triggered by a programmatic load/switch (not a user edit).
    if (switchingRef.current) {
      switchingRef.current = false;
      return;
    }

    const handler = setTimeout(async () => {
      try {
        setError(null);
        await DashboardLayoutApi.saveConfig(activeLayoutId, {
          positions: items,
          columns: 12,
          widgets: items.map(item => item.type),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido ao salvar');
        console.error(err);
      }
    }, 1500);

    return () => {
      clearTimeout(handler);
    };
  }, [items, isLoading, activeLayoutId, error]);

  // A funcionalidade de carregamento automático do último chat salvo foi removida

  const handleInstanceActivated = useCallback((chatId: string) => {
    console.debug(`Dashboard: Ativando instância de chat ${chatId}`);
    setActiveChatInstanceIds(prev => {
      const newSet = new Set(prev);
      newSet.add(chatId);
      console.debug(`Dashboard: Instâncias ativas após ativação: [${Array.from(newSet).join(', ')}]`);
      return newSet;
    });
  }, []);

  const handleInstanceDeactivated = useCallback(function handleInstanceDeactivated(chatId: string) {
    console.debug(`Dashboard: Desativando instância de chat ${chatId}`);
    setActiveChatInstanceIds(function updateActiveInstances(prev) {
      const next = new Set(prev);
      next.delete(chatId);
      console.debug(`Dashboard: Instâncias ativas após desativação: [${Array.from(next).join(', ')}]`);
      return next;
    });
  }, []);

  const handleDocumentAnalysis = useCallback((documents: DocumentOption[]) => {
    setSelectedDocuments(documents);
    setActiveSpreadsheetDocumentId(documents[0]?.id || null);
  }, []);

  const handleGenerateChart = useCallback(async (query: string, chatInstanceId: string, documentIds?: string[]) => {
    // Generate chart from chat feature is temporarily disabled during Analytics refactor.
    console.debug('Generate chart called', { query, chatInstanceId, documentIds });
  }, []);

  const handleClearLayout = useCallback(async () => {
    if (!activeLayoutId) return;
    try {
      await DashboardLayoutApi.saveConfig(activeLayoutId, {
        positions: [],
        columns: DASHBOARD_GRID_CONFIG.GRID.COLS.lg,
        widgets: [],
      });
      switchingRef.current = true;
      setLayout([]);
    } catch (error) {
      console.error('Error clearing layout:', error);
      setError('Falha ao limpar o layout do painel.');
    }
  }, [activeLayoutId, setLayout]);

  // --- Tab (layout) handlers ---
  const handleSwitchLayout = useCallback(async (id: string) => {
    if (id === activeLayoutId) return;
    try {
      const layout = await DashboardLayoutApi.activate(id);
      setActiveLayoutId(id);
      setLayouts(prev => prev.map(l => ({ ...l, isActive: l.id === id })));
      switchingRef.current = true;
      setLayout(layout.config.positions || []);
    } catch (error) {
      console.error('Error switching layout:', error);
      setError('Falha ao trocar de aba.');
    }
  }, [activeLayoutId, setLayout]);

  const handleCreateLayout = useCallback(async () => {
    try {
      const created = await DashboardLayoutApi.create(`Dashboard ${layouts.length + 1}`, {
        positions: [], columns: 12, widgets: [],
      });
      setLayouts(prev => [...prev.map(l => ({ ...l, isActive: false })), created]);
      setActiveLayoutId(created.id);
      switchingRef.current = true;
      setLayout([]);
    } catch (error) {
      console.error('Error creating layout:', error);
      setError('Falha ao criar nova aba.');
    }
  }, [layouts.length, setLayout]);

  const handleRenameLayout = useCallback(async (id: string, name: string) => {
    try {
      const updated = await DashboardLayoutApi.rename(id, name);
      setLayouts(prev => prev.map(l => (l.id === id ? { ...l, name: updated.name } : l)));
    } catch (error) {
      console.error('Error renaming layout:', error);
      setError('Falha ao renomear a aba.');
    }
  }, []);

  const handleDeleteLayout = useCallback(async (id: string) => {
    try {
      await DashboardLayoutApi.remove(id);
      const list = await DashboardLayoutApi.list();
      const active = list.find(l => l.isActive) ?? list[0] ?? null;
      setLayouts(list);
      setActiveLayoutId(active?.id ?? null);
      switchingRef.current = true;
      setLayout(active?.config.positions || []);
    } catch (error) {
      console.error('Error deleting layout:', error);
      setError('Falha ao excluir a aba.');
    }
  }, [setLayout]);

  // --- Layer 2: Find first free position (infinitely downwards) ---
  const handleAddWidget = useCallback((type: string, position?: { x: number; y: number }) => {
    // If an explicit position is provided (drag-drop), use it directly
    if (position) {
      addWidget(type, position);
      return;
    }

    // No position given (button click) → find first free slot scanning downwards
    const dims = getWidgetDimensions(type);
    const wantH = dims.H;
    const wantW = dims.W;
    const cols = DASHBOARD_GRID_CONFIG.GRID.COLS.lg;
    const MAX_SEARCH_ROWS = 500; // Arbitrary deep search limit for Canvas

    for (let row = 0; row <= MAX_SEARCH_ROWS; row++) {
      for (let col = 0; col <= cols - wantW; col++) {
        let isFree = true;
        for (const item of items) {
          const overlapX = col < item.x + item.w && col + wantW > item.x;
          const overlapY = row < item.y + item.h && row + wantH > item.y;
          if (overlapX && overlapY) { isFree = false; break; }
        }
        if (isFree) {
          addWidget(type, { x: col, y: row });
          return;
        }
      }
    }

    console.warn(`[DashboardGrid] Sem espaço para "${type}". Remova ou reorganize widgets.`);
  }, [items, addWidget]);

  const handleDrop = useCallback(
    (layout: Layout[], item: Layout, event: DragEvent) => {
      event.preventDefault();
      const widgetType = event.dataTransfer?.getData(
        'application/react-widget-type'
      );
      if (widgetType) {
        handleAddWidget(widgetType, { x: item.x, y: item.y });
      }
    },
    [handleAddWidget]
  );

  // Resize guard logs removed. We now allow infinite resize downwards in canvas mode.
  // preventCollision={true} handles widget overlapping dynamically.

  // --- Layout Change ---
  const onLayoutChange = (newLayout: Layout[]) => {
    // In Canvas mode, we no longer artificially clamp widgets.
    // the layout natively expands the container height (autoSize=true).
    
    // Check if any position actually changed comparing to state
    const hasChanged = newLayout.some(layoutItem => {
      const originalItem = items.find(item => item.id === layoutItem.i);
      return !originalItem ||
        originalItem.x !== layoutItem.x ||
        originalItem.y !== layoutItem.y ||
        originalItem.w !== layoutItem.w ||
        originalItem.h !== layoutItem.h;
    });

    if (hasChanged) {
      const updatedItems = items.map(originalItem => {
        const layoutUpdate = newLayout.find(l => l.i === originalItem.id);
        if (layoutUpdate) {
          return {
            ...originalItem,
            x: layoutUpdate.x,
            y: layoutUpdate.y,
            w: layoutUpdate.w,
            h: layoutUpdate.h,
          };
        }
        return originalItem;
      }).filter(Boolean) as DashboardGridItem[];
      
      updateLayout(updatedItems);
    }
  };

  function renderWidgetContent(item: DashboardGridItem): React.ReactNode {
    switch (item.type) {
      // Document Chat - para conversa sobre documentos (Qdrant)
      case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.DOCUMENT_CHAT:
      case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.CHAT: // Legacy fallback
        return (
          <DocumentChatWidget
            id={item.id}
            onClose={() => removeWidget(item.id)}
            onInstanceActivated={handleInstanceActivated}
            onInstanceDeactivated={handleInstanceDeactivated}
            activeChatInstanceIds={activeChatInstanceIds}
            onDocumentAnalysis={handleDocumentAnalysis}
            onGenerateChart={handleGenerateChart}
            lastAssistantMessage={lastAssistantMessage}
          />
        );

      // Generic Chat - chat expansível para futuros usos (Dynamic Tables)
      case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.GENERIC_CHAT:
        return (
          <GenericChatWidget
            id={item.id}
            onClose={() => removeWidget(item.id)}
            title="Chat"
            inputPlaceholder="Digite sua pergunta..."
          />
        );

      case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.KPI:
        return (
          <AnalyticsWidget
            id={item.id}
            onClose={() => removeWidget(item.id)}
            initialConfig={item.widgetConfig}
            onConfigChange={(config) => updateWidgetConfig(item.id, config)}
          />
        );

      case DASHBOARD_GRID_CONFIG.WIDGET_TYPES.ERP_VIEW:
        return (
          <ErpViewWidget
            id={item.id}
            onClose={() => removeWidget(item.id)}
            initialConfig={item.widgetConfig}
            onConfigChange={(config) => updateWidgetConfig(item.id, { ...config })}
          />
        );

      default:
        return <div className="widget-content p-4">Widget {item.type}</div>;
    }
  }


  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Carregando layout...</div>;
  }

  return (
    <div className="h-full w-full flex flex-col">
      <DashboardTabsBar
        layouts={layouts}
        activeLayoutId={activeLayoutId}
        onSwitch={handleSwitchLayout}
        onCreate={handleCreateLayout}
        onRename={handleRenameLayout}
        onDelete={handleDeleteLayout}
      />
      <div ref={gridContainerRef} className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}
      <ResponsiveGridLayout
        className="min-h-full"
        isDroppable={true}
        onDrop={handleDrop}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: DASHBOARD_GRID_CONFIG.GRID.COLS.lg, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={DASHBOARD_GRID_CONFIG.GRID.ROW_HEIGHT}
        margin={[DASHBOARD_GRID_CONFIG.GRID.MARGIN[0], DASHBOARD_GRID_CONFIG.GRID.MARGIN[1]]}
        onLayoutChange={onLayoutChange}
        autoSize={true}
        preventCollision={true}
        compactType={null}
        isDraggable
        isResizable
        draggableHandle=".drag-handle"
        draggableCancel=".widget-action-btn"
      >
        {items.map(item => {
          const dims = getWidgetDimensions(item.type);

          return (
            <div
              key={item.id}
              data-grid={{
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
                minW: dims.MIN_W,
                minH: dims.MIN_H,
              }}
              className="group relative h-full w-full"
            >
              {renderWidgetContent(item)}
            </div>
          );
        })}
      </ResponsiveGridLayout>

        <FloatingAddWidgetButton
          onAddWidget={(type) => handleAddWidget(type)}
          onClearLayout={handleClearLayout}
        />
      </div>
    </div>
  );
}
