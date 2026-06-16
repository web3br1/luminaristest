'use client';

import React, { ReactNode, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { WidthProvider, Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
// Persistência de chat removida

import { useAuth } from '@/lib/context/AuthContext';
import { getCookie } from 'cookies-next';
import DocumentChatWidget from '../chat/components/DocumentChatWidget';
import GenericChatWidget from '../generic-chat/components/GenericChatWidget';
import AnalyticsWidget from '../analytics/AnalyticsWidget';
import ErpViewWidget from '../erp-view/ErpViewWidget';
import { DASHBOARD_GRID_CONFIG } from './dashboard-grid.config';
import useDashboardGrid from './hooks/use-dashboard-grid';
import { DocumentOption } from '../chat/components/DocumentSelector';
import { DashboardGridItem, LayoutResponse } from './types/dashboard-grid.types';
import FloatingAddWidgetButton from './FloatingAddWidgetButton';
import { getWidgetDimensions } from './utils/dashboard-grid.utils';

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function DashboardGrid() {
  const { user } = useAuth();
  const { items, updateLayout, addWidget, removeWidget, setLayout, updateWidgetConfig } = useDashboardGrid();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);
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

  useEffect(function loadLayoutOnMount() {
    async function loadLayout() {
      try {
        setIsLoading(true);
        setError(null);
        const token = getCookie('auth_token');
        if (!token) {
          // Aguarda o token estar disponível antes de tentar carregar
          setIsLoading(false);
          return;
        }
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard-layout`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
          if (response.status === 404) {
            console.log('Nenhum layout salvo encontrado. Criando layout padrão...');
            const createPayload = {
              name: 'User Dashboard',
              type: 'GRID',
              config: { positions: [], columns: 12, widgets: [] },
            };
            try {
              const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard-layout`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(createPayload),
              });
              if (!createRes.ok) {
                throw new Error(`Falha ao criar layout (status ${createRes.status}).`);
              }
              const created = await createRes.json();
              const positions = created?.data?.config?.positions || [];
              setLayout(positions);
              return;
            } catch (createErr) {
              console.error(createErr);
              setLayout([]);
              setError('Não foi possível criar o layout inicial.');
              return;
            }
          }
          throw new Error('Falha ao carregar o layout do painel.');
        }
        const data: LayoutResponse = await response.json();
        if (data.success && data.data?.layouts && data.data.layouts.length > 0) {
          const mainLayout = data.data.layouts[0];
          const layoutItems = mainLayout.config.positions || [];
          setLayout(layoutItems);
        } else {
          setLayout([]);
        }

        // A funcionalidade de carregar o último chat foi desativada
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    if (user) {
      loadLayout();
    }
  }, [user, setLayout]);

  useEffect(function saveLayoutOnChange() {
    // Não salva durante carregamento inicial ou se houver erro crítico
    if (isInitialMount.current || isLoading || !!error) {
      if (!isLoading) isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(async () => {
      try {
        setError(null);
        const payload = {
          name: 'User Dashboard',
          type: 'GRID',
          config: {
            positions: items,
            columns: 12, // Valor padrão, pode ser ajustado conforme necessário
            widgets: items.map(item => item.type), // Extrai os tipos de widgets do layout atual
          },
        };
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard-layout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getCookie('auth_token')}` },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('Falha ao salvar o layout do painel.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido ao salvar');
        console.error(err);
      }
    }, 1500);

    return () => {
      clearTimeout(handler);
    };
  }, [items, isLoading]);

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
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiUrl) return;

    try {
      const emptyLayoutPayload = {
        name: 'User Dashboard',
        type: 'GRID',
        config: {
          columns: DASHBOARD_GRID_CONFIG.GRID.COLS.lg,
          widgets: [],
          positions: [],
        },
      };

      const token = getCookie('auth_token');
      if (!token) return;

      const response = await fetch(`${apiUrl}/dashboard-layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(emptyLayoutPayload),
      });

      if (!response.ok) throw new Error('Falha ao limpar o layout');

      setLayout([]);
    } catch (error) {
      console.error('Error clearing layout:', error);
      setError('Falha ao limpar o layout do painel.');
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
            onConfigChange={(config) => updateWidgetConfig(item.id, config as unknown as Record<string, unknown>)}
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
    <div ref={gridContainerRef} className="h-full w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative">
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
  );
}
