# Arquitetura do Frontend — Luminaris (my-app)

Aplicação **Next.js (Pages Router) + TypeScript** organizada por **features**, com renderização
**dirigida por schema** (formulários e tabelas montados a partir do schema das tabelas dinâmicas do
backend), estado global via **Context API**, i18n com **next-i18next** e um **sistema de widgets** no
dashboard. Este documento é a porta de entrada da arquitetura do front.

> Quick-start e índice de docs: [`README.md`](./README.md). A documentação profunda das views de
> dashboard vive em [`features/dashboard/category-views/`](./features/dashboard/category-views/).

---

## 1. Princípios

- **Feature-based:** o domínio vive em `features/<feature>/` (components, hooks, utils, types).
- **Dirigido por schema:** o front não hardcoda formulários/tabelas — ele lê o `schema` da tabela
  dinâmica (vindo do backend `dynamicTables`) e renderiza dinamicamente (`DynamicForm`, views
  genéricas). É a contraparte da governança declarativa do backend.
- **Camada de serviços fina:** componentes nunca chamam `fetch` direto; usam services
  (`lib/services/*`) sobre um **API client** central.
- **Estado global por Context:** sem Redux — `AuthContext`, `CurrencyContext`,
  `DashboardDataContext`, `ToastContext`.

---

## 2. Estrutura de diretórios

```
my-app/
├── ARCHITECTURE.md            # este documento
├── README.md                  # quick-start + índice
├── pages/                     # rotas (Pages Router): index, users/*, documents/*, dashboard/*
├── features/                  # domínios: dashboard, documents, interview, dev
│   └── dashboard/             # o maior: category-views, components/forms, shared
├── components/                # UI reutilizável + widgets
│   ├── ui/                    # primitivos (Galaxy theme, Modal, feedback/, wizard/)
│   ├── widgets/               # widgets do dashboard (dashboard-grid, chat, analytics, erp-view, ...)
│   ├── layout/, floating-chat/, error-boundaries/
├── lib/                       # api/ (client), services/, context/, hooks/, hoc/, utils/, notifications/
├── public/locales/{en,pt}/    # traduções i18n (namespaces)
├── styles/                    # estilos globais (Tailwind)
└── types/                     # tipos globais
```

---

## 3. Bootstrap e providers (`pages/_app.tsx`)

A árvore de providers (de fora para dentro):

```
ErrorBoundary
└─ AuthProvider           # usuário/sessão (cookie auth_token)
   └─ CurrencyProvider    # moeda do usuário (formatação)
      └─ DashboardDataProvider   # dados globais do dashboard
         └─ ToastProvider        # notificações (portal)
            └─ <App />  (+ Navbar, oculta em /users/*; FloatingChatContainer em /dashboard/*)
```

O app é envolvido por `appWithTranslation` (i18n). `pages/_document.tsx` injeta o script inline de
tema (light/dark) para evitar flash, e o `lang` por locale.

---

## 4. Camada de dados (API client + services)

### `lib/api/api-client.ts` — `ApiClient` (singleton)
- `get/post/put/patch/delete<T>()` sobre `fetch`, com base `NEXT_PUBLIC_API_BASE_URL`
  (`http://localhost:3001/api`).
- Injeta automaticamente `Authorization: Bearer <auth_token>` (cookie via `cookies-next`) e
  `x-user-timezone`.
- Em resposta de erro, dispara uma **notificação** (toast) automaticamente.

### `lib/services/*.service.ts` — wrappers por domínio
`auth`, `user`, `document`, `finance`, `analytics`, `location`, e o hub **`dynamic-table.service.ts`**:
- Tabelas: `getTables`, `getTableById`, `getSubTables`.
- Dados: `getTableData`, `getRecordById`; CRUD `createRecord`/`updateRecord`/`deleteRecord`.
- Relações: `performLookup({ targetTableId, displayField, keys })` (resolve FK → display).
- Meta do dashboard: `getSidebar`, `getSystem`.

> Fluxo: **Componente → service (`lib/services`) → `ApiClient` (auth + timezone) → backend `:3001/api`**.

---

## 5. Estado global (`lib/context/`)

| Context | Conteúdo |
|---|---|
| `AuthContext` | `{ user, isAuthenticated, isLoading, login(), logout() }`; verifica sessão via `/auth/me`; guarda `auth_token` em cookie; sincroniza `locale`/`currency` do usuário. |
| `CurrencyContext` | moeda ativa para formatação monetária. |
| `DashboardDataContext` | dados globais compartilhados entre as views do dashboard. |
| `ToastContext` | `showToast(message, type, title)` via portal; ouve `app:notify` disparado pelo `ApiClient`. |

---

## 6. Renderização dirigida por schema (a ponte com o backend)

O coração do front: dado um `schema` (`{ fields: ISchemaField[], defaultDisplayField?, ui? }`), a UI é
montada automaticamente.

- **`features/dashboard/components/forms/DynamicForm.tsx`** — dispatcher `field.type → componente`
  (`dynamic-form-fields/`: Input, Currency, Percentage, Select, Relation, Cep/Address, Textarea,
  Checkbox, Slider...). Aplica heurísticas (price→currency, cep→address), valida `required`/tipo, e
  traduz labels via namespace `database:fields.<name>`. Respeita `hidden`/`readOnly` do campo.
- **Resolução de relações (FK → texto):**
  `features/dashboard/shared/hooks/useTableRelationLookups.ts` varre os campos `relation`, busca as
  tabelas-alvo em paralelo e monta `Map<id, displayName>`; `formatRelatedDisplayValue`
  (`relation-utils.client.ts`) usa `defaultDisplayField` da tabela-alvo (ou heurística) para o texto.
- **Busca/ordenação por schema:** `category-views/shared/utils/sortUtils.ts` expõe
  `getSearchableFields(schema)` (opt-out via `searchable: false`) e os campos ordenáveis permitidos.
- **Apresentação:** `category-views/shared/utils/presentationUtils.ts` (`isNavigable`,
  `getTablePresentation`) lê `ui.presentation` (`standalone` | `embedded` | `system`) para decidir o
  que aparece nas views.

---

## 7. Views de dashboard (category-views)

`features/dashboard/category-views/` é a parte mais madura do front. Cada categoria (finance,
inventory, people, products, services, planning…) tem uma view especializada; o **padrão-ouro** para
o que não tem view dedicada é o **`GenericTabbedView`** (`category-views/shared/`):

- `useGenericData(tableId)` resolve tabela + schema + registros + relação lookups.
- Componentes: `CategoryHeader`, `CategoryTabs`, `GenericFilterBar`, `GenericTable`,
  `CustomizeColumnsPanel`, `ConfirmDeleteModal`; paginação padrão (`StandardPagination`).

> Documentação detalhada por categoria em
> [`category-views/`](./features/dashboard/category-views/) (finance tem README + SALES/EXPENSES/SHARED).

---

## 8. Sistema de widgets (`components/widgets/`)

O dashboard customizável é um **grid de widgets**:

- **`dashboard-grid/`** — grid responsivo com `react-grid-layout` (`WidthProvider`); o hook
  `useDashboardGrid` gerencia `items`/layout e persiste via API `/dashboard-layout`
  (ver [README](./components/widgets/dashboard-grid/README.md)).
- Widgets disponíveis: `chat` (DocumentChat/GenericChat), `analytics` (KPIs/charts), `erp-view`,
  `generic-chat`.

---

## 9. i18n (`next-i18next`)

- Locales **`en`** (default) e **`pt`** (`next-i18next.config.js`).
- Traduções em `public/locales/{en,pt}/` por **namespace**: `common`, `database`, `analytics`,
  `chatMessages`, `finance_view`, `inventory_view`, `products_view`.
- Labels de campo dirigidos por schema usam **`database:fields.<name>`** (com fallback para o `label`
  EN do schema) — a mesma convenção citada no backend.
- SSR: páginas usam `serverSideTranslations(locale, [namespaces])`; o locale acompanha
  `AuthContext.user.locale`.

---

## 10. Plugando uma nova área

1. **Rota:** crie a página em `pages/<rota>.tsx` (Pages Router).
2. **Feature:** organize a lógica em `features/<feature>/` (components/hooks/utils/types).
3. **Dados:** acesse o backend por um service em `lib/services/` (nunca `fetch` direto).
4. **UI dinâmica:** se a tela é dirigida por schema, reuse `DynamicForm` e o padrão
   `GenericTabbedView` antes de criar algo novo.
5. **i18n:** adicione as chaves nos namespaces de `public/locales/{en,pt}/`.
6. **Doc:** README da área (ver convenção abaixo).

---

## 11. Convenções de documentação

- **Template = `category-views`.** Área simples → um `README.md`; área complexa → README + docs por
  concern (como finance: README + SALES/EXPENSES/SHARED).
- Todo README de componente/feature deve ter: responsabilidade, **componentes/hooks reais** com props,
  e a fronteira com o resto.
- **Atualize o README no mesmo PR** que muda a API pública do componente/feature — é o que evita o
  congelamento que aconteceu em vários docs antigos.
