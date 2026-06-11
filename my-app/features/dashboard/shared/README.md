# `shared/` — UI Primitives, Hooks & Utilities

> Schema-agnostic building blocks used across the entire Dashboard feature.
> Componentes que aceitam props tipadas mas **não carregam conhecimento de
> domínio** — não sabem o que é uma "venda" ou um "item de estoque".

**Status:** ✅ Gold Standard (auditado)

---

## Folder Structure

```
shared/
├── components/          # Generic UI components
├── hooks/               # Cross-view React hooks
├── utils/               # Pure formatting utilities
├── index.ts             # Barrel — import from here across views
└── README.md            # This file
```

---

## Components

| Component | Description |
|-----------|-------------|
| `CollapsibleSidebar` | Animated sidebar que recolhe para uma barra de ícones, com persistência localStorage |
| `ConfirmDeleteModal` | Wrapper fino do `ConfirmModal` com defaults de inativação (soft delete) |
| `CustomizeColumnsPanel` | Slide-over com drag-and-drop (@dnd-kit) para toggle + reordenar colunas |
| `EmptyState` | Empty state padronizado com ícone + título + descrição + action opcional |
| `ResizableSidebar` | Sidebar arrastável com constraints min/max width |
| `SortableColumnItem` | Item drag-and-drop usado dentro de `CustomizeColumnsPanel` |
| `StandardPagination` | Pagination bar acessível com auto-scroll-to-top |
| `TruncatedText` | Trunca strings longas com tooltip no hover (title attribute) |

---

## Hooks

| Hook | Description |
|------|-------------|
| `useRenderTypedValue` | Retorna função `renderTypedValue` pré-injetada com locale + currency do usuário (via `CurrencyContext` + `useTranslation`). **Use sempre em colunas de tabela.** |
| `useTableRelationLookups` | Resolve FK values em display strings. Aceita `IDynamicTable` + lista completa de tabelas (zero HTTP extra se `defaultDisplayField` puder ser resolvido localmente). **Canonical FK resolver — use este.** |
| `useRelationLookups` ⚠️ | **Deprecated.** Único consumer: `KpiDrillDownDrawer` (Finance Analytics). Retorna `Map<string,string>` flat (incompatível com a versão canônica). Removerá durante a auditoria de Finance Analytics. **Não adicione novos callers.** |

---

## Utils (`utils/formatters.ts`)

Pure functions — sem React hooks, sem APIs browser-only. Safe para importar de
server components, RSC ou scripts.

| Export | Description |
|--------|-------------|
| `formatCurrency(value, locale, currency)` | `1234.56 → "R$ 1.234,56"` (default pt-BR/BRL) |
| `formatBRL(value)` | Alias para `formatCurrency` em pt-BR/BRL |
| `formatPercent(value, decimals, locale)` | `0.5 → "0,5%"` |
| `abbreviateNumber(value, locale)` | `1500000 → "1,5M"` |
| `formatCompactCurrency(value, locale, currency)` | `1500000 → "R$ 1,5M"` |
| `formatDate(value, locale, options)` | ISO/Date → string localizada (suporta showTime, showWeekday, dateOnly) |
| `formatDateBR(value)` | Alias BR (dd/mm/yyyy) |
| `renderCell(val, t?)` | Render genérico para qualquer valor (boolean → Yes/No via t opcional) |
| `renderTypedValue(value, fieldType, options)` | Dispatch por type do schema (currency/date/boolean/number/relation). Suporta `numberFormat: 'currency' \| 'percentage' \| 'integer' \| 'decimal'`. |
| `calcPercent(value, total)` | `(50, 200) → 25` |
| `getStatusBadgeClasses(scheme)` | Classes Tailwind para status badge (success/warning/error/info/neutral) |
| `getStatusColorScheme(status?)` | Mapeia strings de status (PT + EN) para color scheme — multilíngue por design |
| `filterByQuery(records, query)` | Filtro genérico por substring no `JSON.stringify` dos campos |

**Sobre os defaults `'pt-BR'`/`'BRL'`:** são last-resort. Em qualquer chamada via
`useRenderTypedValue` os valores reais do `CurrencyContext` + `i18n.language`
sobrescrevem o default. Em pure utilities (fora de React) o caller deve passar
explicitamente quando o mercado não for BR.

---

## Gold Standard Patterns (auditoria)

| Padrão | Aplicação |
|---|---|
| **Zero `as any` no código** | `useRelationLookups` antes usava `as any` para esconder drift de contrato — substituído por `as unknown as Parameters<...>[0]` com comentário documentando a migração pendente. |
| **EN fallbacks em todo `t()`** | `ConfirmDeleteModal`, `CustomizeColumnsPanel`, `CollapsibleSidebar`, `ResizableSidebar`, `StandardPagination` — todos com fallbacks em inglês. Antes da auditoria, todos tinham fallbacks PT (`Confirmar Inativação?`, `Colunas Visíveis`, `Restaurar Padrão`, etc.). |
| **`useCallback` em handlers** | `handleToggle`, `handleMouseDown`, `handleMouseMove`, `handleMouseUp`, `handleDragEnd`, `handleReset`, `handleToggleOpen`. |
| **`import type` para types** | `ColumnDefinition`, `DragEndEvent`, `IDynamicTable`, `ISchemaField`, `ITableSchema`. |
| **Comments em EN** | `useRelationLookups`, `useTableRelationLookups`, `EmptyState` — antes tinham comentários PT explicando lógica interna. |
| **Locale-aware sem hardcode implícito** | `useRenderTypedValue` agora cai para `navigator.language` quando i18n não tem language definida, não mais `'pt-BR'`. |
| **Deprecation explícita** | `useRelationLookups` está marcada `@deprecated`, JSDoc aponta o substituto e o caller restante. `EmptyState.message` está marcada `@deprecated` em favor de `description`. |
| **Multilíngue intencional** | `getStatusColorScheme` reconhece status em PT e EN (`'pago'`/`'paid'`, `'cancelado'`/`'cancelled'`, etc.) — heurística aceita por design para suportar backends bilíngues. |

---

## Architecture Rules

1. **HTTP só vive em data hooks.** Componentes e utils desta pasta **nunca**
   chamam `fetch`/axios diretamente. Toda data fetching é responsabilidade do
   hook `useXData` da category-view, que passa records já tipados como props.

2. **Exceção controlada:** `useRelationLookups` e `useTableRelationLookups`
   chamam `DynamicTableService` — esses são os FK resolvers canônicos, parte
   da infraestrutura compartilhada, não data fetching de domínio.

3. **`useRenderTypedValue` é o ponto único de injeção de locale/currency.**
   Em vez de cada cell renderer descobrir locale/currency próprio, todos
   consomem via esse hook.

---

## Import Pattern

```typescript
// Preferred — barrel para imports cross-view
import { StandardPagination, EmptyState, useRenderTypedValue } from '../../shared';

// Direct — aceitável para imports intra-view (sem trip in barrel cache)
import { StandardPagination } from '../../shared/components/StandardPagination';
```

---

## Tech debt restante

- **`useRelationLookups` (deprecated).** Caller único: `KpiDrillDownDrawer` em Finance Analytics. Migração para `useTableRelationLookups` foi adiada até a auditoria de Finance Analytics — exigirá refactor coordenado de `TableView.tsx` + `KpiDrillDownDrawer.tsx` por causa da diferença de shape (`Map<string,string>` flat vs. `Record<string, Map>` por campo). O cast nominado em `useRelationLookups.ts:100` documenta essa drift até a migração acontecer.

Nenhum outro débito conhecido nesta pasta.

---

## Related

- **`category-views/shared/`** — Hooks/components compartilhados pelas views (`useTableColumnControls`, `useColumnSort`, `CategoryHeader`, etc.)
- **`components/`** — Componentes schema-aware (forms dinâmicos, sidebar de detalhes, FAB)
- **Skill `ui-relation-resolving`** — Padrão teórico para resolução de FK no frontend

---

_Última atualização: 2026-05-27 · Auditoria Gold Standard concluída._
