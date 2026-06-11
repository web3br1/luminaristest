# components/widgets — Widgets do dashboard

Catálogo dos widgets que compõem o dashboard customizável. O container que os posiciona e persiste é o
[`dashboard-grid`](./dashboard-grid/README.md); cada tipo de widget é renderizado conforme a config do
grid (ver [`ARCHITECTURE.md` §8](../../ARCHITECTURE.md)).

| Widget | Pasta | Papel | Doc |
|---|---|---|---|
| **Dashboard Grid** | `dashboard-grid/` | Container do grid (react-grid-layout) + persistência de layout. | [README](./dashboard-grid/README.md) |
| **Chat** | `chat/` | Chat sobre documentos (RAG) com coordenação multi-instância no grid. | [README](./chat/README.md) |
| **Analytics** | `analytics/` | KPIs/charts do motor de Analytics. | — (abaixo) |
| **Generic Chat** | `generic-chat/` | Chat genérico **Agent ERP** (com confirmação de ações). | — (abaixo) |
| **ERP View** | `erp-view/` | Visualização embutida de uma tabela do ERP. | — (abaixo) |
| **Shared** | `shared/` | Hooks de chat reutilizados pelos widgets. | — (abaixo) |

---

## Analytics (`analytics/`)
- **`AnalyticsWidget.tsx`** — renderiza um KPI/grupo de analytics (tipo de widget `kpi` no grid),
  consumindo `analytics.service.ts`.
- **`GoldKpiWidgetView.tsx`** — a apresentação visual ("gold") de um KPI.

## Generic Chat (`generic-chat/`)
Chat **genérico/Agent ERP** (sem documentos), contraparte do `chat/` (RAG):
- `components/GenericChatWidget.tsx` — o widget expansível.
- `components/CommandConfirmationModal.tsx` — confirma uma **ação proposta** pelo agente antes de
  executar (espelha o `ACTION_PROPOSAL`/`confirmedProposalId` do backend `chat`).
- `hooks/useGenericChat.ts` · `types/generic-chat.types.ts`.

## ERP View (`erp-view/`)
- **`ErpViewWidget.tsx`** — embute uma tabela do ERP (dynamic table) dentro do grid, reusando a
  renderização dirigida por schema.

## Shared (`shared/`)
- **`hooks/`** — `useChatInstance`, `useChatInstances`, `useChatMessages`: hooks de instância/mensagens
  de chat compartilhados entre os widgets de chat.

---

> Para os modos de resposta (RAG vs Agent ERP) e a integração com o backend, ver
> [`chat/README.md`](./chat/README.md) e a feature [`chat`](../../../server/src/features/chat/README.md).
