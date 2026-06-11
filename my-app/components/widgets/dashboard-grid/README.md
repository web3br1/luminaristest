# Dashboard Grid

Grade arrastável e redimensionável de **widgets** do dashboard, baseada em **`react-grid-layout`**
(`Responsive` + `WidthProvider`). É o container que monta, posiciona e persiste os widgets do usuário.

> Parte do sistema de widgets — ver [`ARCHITECTURE.md` §8](../../../ARCHITECTURE.md).

## Componente

`DashboardGrid` (`dashboard-grid.tsx`) — **não recebe props**: lê o usuário (`useAuth`) e o layout
(`useDashboardGrid`) internamente, e gerencia o carregamento/persistência do layout via API.

- Drag-and-drop e resize são nativos do `react-grid-layout` (não há dnd-kit nem `SortableItem`).
- `maxRows` é calculado dinamicamente pela altura do container (`ResizeObserver`), evitando que os
  widgets ultrapassem a viewport.
- **`FloatingAddWidgetButton`** (botão flutuante) adiciona novos widgets.

## Hook — `useDashboardGrid` (`hooks/use-dashboard-grid.ts`)

Expõe o estado e as operações do grid:
`{ items, updateLayout, addWidget, removeWidget, setLayout, updateWidgetConfig }`.
O layout é persistido no backend (endpoint de dashboard layout) e recarregado na montagem.

## Tipos de widget (`dashboard-grid.config.ts`)

| Tipo | Constante | O que renderiza |
|---|---|---|
| `document-chat` | `DOCUMENT_CHAT` | `DocumentChatWidget` — chat RAG sobre documentos vetorizados (Qdrant) |
| `generic-chat` | `GENERIC_CHAT` | `GenericChatWidget` — chat genérico expansível |
| `kpi` | `KPI` | `AnalyticsWidget` — KPIs do motor de Analytics |
| `erp-view` | `ERP_VIEW` | `ErpViewWidget` — visualização embutida de uma tabela do ERP |
| `chat` | `CHAT` | legado (mantido só para compatibilidade) |

Cada tipo tem dimensões padrão (`DIMENSIONS`) e o grid usa breakpoints responsivos
(`lg/md/sm/xs/xxs` → cols `12/10/6/4/2`, `ROW_HEIGHT: 30`, `MARGIN/PADDING: [12,12]`).

## Coordenação entre chats

O grid mantém estado para orquestrar múltiplos widgets de chat e a integração com analytics:
`activeChatInstanceIds`, `selectedDocuments`, `activeSpreadsheetDocumentId` e `lastAssistantMessage`
(usado para, por exemplo, gerar gráficos a partir da última resposta).

## Estrutura de arquivos

```
dashboard-grid/
├── dashboard-grid.tsx          # o componente (container do grid)
├── dashboard-grid.config.ts    # tipos de widget, dimensões, breakpoints
├── FloatingAddWidgetButton.tsx # botão flutuante de adicionar widget
├── hooks/use-dashboard-grid.ts # estado + persistência do layout
├── utils/                      # helpers (ex: getWidgetDimensions)
├── types/                      # DashboardGridItem, LayoutResponse, DashboardGridConfig
└── index.ts
```
