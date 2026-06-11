# Área 5 — Frontend (my-app) (Auditoria Profunda)

> Parte do relatório `auditoria_profunda_areas.md`. Gerado em 2026-06-11.

Stack: Next.js 15 (Pages Router) + React 19 + TypeScript; `@dnd-kit`, `react-grid-layout`, `recharts`, `react-markdown`, `react-select`, `zod`, `next-i18next`, `cookies-next`. i18n pt/en; multi-moeda BRL/USD/EUR.

## 1. Páginas e rotas

| Rota | Arquivo | Conteúdo | Auth/Guard | Dados |
|---|---|---|---|---|
| `/` | `pages/index.tsx` | `DashboardGrid` (widgets) | `withAuth()` | via widgets filhos |
| `/users/login` | `pages/users/login.tsx` | Form login + remember-me (cookie 30d/24h) | público | `AuthService.login` → POST /auth/login; cookie `auth_token` (secure em prod, sameSite strict) |
| `/users/signup` | `pages/users/signup.tsx` | Form registro (username min 3, senha min 6) | público | POST /users → redirect login?created=true |
| `/dashboard` | `pages/dashboard/index.tsx` | Sidebar de categorias + views por categoria (PeopleView, PlanningView, LeadsView, KanbanView, InternalProductsView, ServicesView, InventoryView, FinanceView; fallback GenericTabbedView) | SSR extrai token do cookie; 401/403 → login; sem tabelas → /dashboard/setup | SSR GET /dynamic-tables |
| `/dashboard/setup` | `pages/dashboard/setup.tsx` | Wizard 3 abas (QuickSetup / TotalControlSetup / AiInterviewSetup) | redirect se já tem tabelas | GET /dashboard/presets; POST /dashboard/create |
| `/documents` | `pages/documents/index.tsx` | Busca, abas por purpose, cards com status, delete c/ ConfirmModal | auth | GET/DELETE /documents |
| `/documents/create` | `pages/documents/create.tsx` | Upload (não lido em detalhe — inferência) | auth | POST /documents/upload |
| `/users/profile` | `pages/users/profile.tsx` | Perfil, senha (min 6), locale/currency, make-admin (dev) | auth | PATCH /users/{id}, /users/preferences, /users/{id}/role |
| `/users/edit/[id]`, `/users/subscription` | — | não lidos em detalhe (inferência por convenção) | — | — |

## 2. DynamicForm — interpretação do schema

**Arquivo**: `features/dashboard/components/forms/DynamicForm.tsx` (l.1-350)

| Tipo de campo | Componente | Detalhes |
|---|---|---|
| string | InputField | heurística email/phone/CEP/CPF-CNPJ via `format` ou nome; máscaras phone `(XX)XXXXX-XXXX`, CPF, CNPJ |
| number | InputField ou CurrencyField | nomes price/salePrice/unitPrice/cost/amount/discount/total ou regex `/price|amount/i` → CurrencyField |
| date / datetime | InputField type=date | botão "Today"; **datetime não diferenciado** (fallback date) |
| textarea | TextareaField | tipo textarea OU string + regex `/description|notes/i` |
| select | SelectField | opções string[] ou {label,value} |
| boolean / checkbox | CheckboxField | — |
| relation | RelationSelector | FK com busca + Portal; `allowMultiple` |
| json (workSchedule) | WorkScheduleField | regex `/workSchedule|schedule/i` |
| number (percent/commission) | PercentageField | regex `/percent|commission/i` |
| number (BANT) | SliderDiscrete | nomes bantbudget/bantauthority/bantneed/banttiming |

**Validação client** (l.186-221): required (null/''), number (parseFloat + NaN), boolean coerção; erros agregados em `Record<string,string>`; toast antes de submeter. **Não há campo `file`** — upload delegado a `/documents/create` e ao DocumentSelector do chat.

**RelationSelector** (`forms/RelationSelector.tsx`): carrega tabela-alvo via `fetchRelatedTableData`, display via `formatRelatedDisplayValue` (defaultDisplayField/heurística), dropdown com Portal, multi via checkboxes.

## 3. GenericTabbedView

**Arquivo**: `category-views/shared/GenericTabbedView.tsx` (>200 linhas)

Composição: CategoryHeader → CategoryTabs → GenericFilterBar → GenericTable → StandardPagination.

- Dados: `useGenericData(activeTableId, allTables)` — fetch tabela + registros + relation lookups
- Filtros: busca textual em `getSearchableFields(schema)` + filtros por campo; persistência em localStorage (`useFilterPersistence`)
- Sort: por coluna, asc/desc, relações ordenadas por label (`sortRecords`)
- Paginação: **25 itens/página hardcoded** (`ITEMS_PER_PAGE`, l.48)
- Colunas (`GenericTable.tsx:89-112`): uma por field; relation IDs ocultos se há lookup; larguras default por tipo; coluna actions ao final
- Customização (`useTableColumnControls.ts`): drag-reorder (@dnd-kit), visibilidade, resize (re-resizable); persistência `table-columns-${tableId}`
- Ações: edit → modal com DynamicForm; delete → ConfirmModal danger → refetch

## 4. Onboarding

`pages/dashboard/setup.tsx` + `features/interview/setup/`. Fluxo: auth check → table check (SSR) → wizard. QuickSetup: presets agrupados → POST `/dashboard/create {mode:'quick', suiteKey}` → redirect /dashboard. TotalControlSetup e AiInterviewSetup não lidos integralmente (inferência parcial).

## 5. Camada de dados

**ApiClient** (`lib/api/api-client.ts`, 114 linhas, singleton): get/post/put/patch/delete; headers automáticos Content-Type, `x-user-timezone` (Intl), `Authorization: Bearer` do cookie; base URL `NEXT_PUBLIC_API_BASE_URL` (default localhost:3001/api); erro → toast global via evento `app:notify`. **Sem interceptor de 401/refresh** — AuthContext re-checa `/auth/me` reativamente.

**Services** (`lib/services/`): auth, user, document, dynamic-table, analytics, finance, location (CEP→endereço).

## 6. Estado global

- **AuthContext** (`lib/context/AuthContext.tsx`): user/isAuthenticated/isLoading; `checkAuthState()` via /auth/me; re-check em routeChangeComplete; sincroniza locale do user com router; logout = DELETE /auth/logout + remove cookie + redirect
- **CurrencyContext**: BRL/USD/EUR; `formatCurrency` via Intl.NumberFormat (fallback pt-BR/BRL); `setCurrency` otimista + PATCH preferences com revert em falha
- **ToastContext**: evento global `app:notify`; portal em body; auto-dismiss 5s
- **DashboardDataContext**, **FloatingChatProvider**: estado do dashboard/chat (não lidos integralmente)

## 7. Chat/IA no front

- **Floating chat** (`components/floating-chat/`): só em `/dashboard/*` (guard `_app.tsx:94`); múltiplas instâncias
- **ChatWidget** (`components/widgets/chat/components/ChatWidget.tsx`): hooks useChatInstance/useChatInstances/useChatMessages/useChatInput; DocumentSelector multi-select envia `documentIds[]`
- **ChatMessageInput**: textarea auto-grow (max 200px), Enter envia, disabled em loading/erro
- **Aprovação de ActionProposal**: **componente explícito não localizado** — fluxo presumido via botão de confirmação no chat (inferência; merece verificação)

## 8. Analytics no front

Lib: **recharts 2.15.3** (+ @fullcalendar 6.1.18; @handsontable/react 15.3.0 presente porém sem uso identificado em views).

- **GoldKpiWidgetView** (`components/widgets/analytics/GoldKpiWidgetView.tsx`): valor, delta %, trend ▲▼▬, sparkline AreaChart — **sparkline usa dados MOCK** (Math.random, l.54-61); `formatKpiValue` por tipo
- **Dashboard analytics** (`category-views/finance/components/analytics/dashboard/`): DashboardKpiCard, DashboardGaugeCard, DashboardPieChart, DashboardTrendChart, DashboardProgressCard, KpiGridLayout; AnalyticsDashboard carrega ChartPreset[], PeriodSelector, drill-down via KpiDrillDownDrawer

## 9. Inventário de componentes reutilizáveis

- UI: Modal, ConfirmModal (variants danger/warning/info), Toast, Alert, LoadingSpinner, GalaxyBackground, GalaxyCard, WizardModal, WizardTabBar
- Layout: Navbar, AuthSplitLayout, DashboardSidebar, ErrorBoundary
- Widgets: DashboardGrid (react-grid-layout + persistência), FloatingAddWidgetButton
- Tabela: GenericTable, GenericRow, RowActionsCell, RelationCell, StandardPagination, CustomizeColumnsPanel
- Filtros: GenericFilterBar, FilterGroup, FilterToggleButton, SortSelect, ViewModeToggle
- Forms: DynamicForm + InputField, CurrencyField, PercentageField, SelectField, SelectOrInputField, TextareaField, CheckboxField, SliderDiscrete, CepAddressField, WorkScheduleField, RelationSelector

## 10. Riscos (FE-1 a FE-13)

| # | Sev. | Risco | Evidência |
|---|---|---|---|
| FE-1 | OK | `dangerouslySetInnerHTML` no theme script é hardcoded (sem dados de usuário) — seguro | `pages/_document.tsx:18-38` |
| FE-2 | **Alta** | Sem refresh automático de token em 401 — usuário vê erro genérico | `api-client.ts` (ausência de interceptor) |
| FE-3 | Média | CepAddressField: comportamento com CEP inválido não verificado | `CepAddressField.tsx` (não lido) |
| FE-4 | Média | Estado de erro de `useGenericData` pode não ser renderizado no GenericTabbedView | `GenericTabbedView.tsx` |
| FE-5 | **Alta** | Erros 400 da API não populam `fieldErrors` por campo no DynamicForm | `DynamicForm.tsx` |
| FE-6 | Baixa | `generalWidgetError` no ChatMessageInput depende de prop correta | `ChatMessageInput.tsx:51-56` |
| FE-7 | Baixa | useTableRelationLookups sem error handling verificado | hook não lido |
| FE-8 | Baixa | Paginação hardcoded 25/página | `GenericTabbedView.tsx:48` |
| FE-9 | Média | `?devSeed=1` persiste em localStorage indefinidamente | `pages/dashboard/index.tsx:49-62` |
| FE-10 | Baixa | RelationSelector engole erro sem console.error | `RelationSelector.tsx:62` |
| FE-11 | Média | Sparkline do KPI é mock (Math.random) — visual sem dado real | `GoldKpiWidgetView.tsx:54-61` |
| FE-12 | Baixa | `@ts-ignore` no import do next-i18next.config | `pages/_app.tsx:7` |
| FE-13 | Baixa | Sem debounce/throttle em submits — cliques repetidos geram N requests | geral |

## 11. Status de implementação

✅ Auth, DynamicForm (~10 tipos + máscaras), GenericTabbedView completo, RelationSelector, multi-moeda, i18n, tema, floating chat, dashboard grid, KPI cards, onboarding 3 modos, error boundaries, toasts.

🔶 Parcial: upload de documento (página não lida), streaming de chat (não verificado), AiInterviewSetup (não lido).

❌ Ausente: refresh token automático; campo file no DynamicForm; mapeamento de erros API por campo; sparkline real; UI de aprovação de ActionProposal não localizada explicitamente; controle de edição concorrente.
