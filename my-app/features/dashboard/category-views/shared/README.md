# category-views/shared

> Infraestrutura compartilhada entre todas as category-views (Products, Services, People, Planning, Finance, Inventory, e a Generic fallback).

**Status:** ✅ Gold Standard (auditado)

---

## 1. O que é esta pasta

Componentes, hooks e utilitários que **TODAS** as category-views usam:

- **Layout primitives** (header, tabs, filter bar, view-mode toggle)
- **Hooks de tabela** (column resize/order/visibility, column sort, filter persistence)
- **Sort** (UI + utility puro)
- **Generic fallback view** (`GenericTabbedView` + tabela schema-driven + row dispatcher)
- **Células reutilizáveis** (relation popover, row actions)

Quando algo é usado por **2+ category-views**, vive aqui. Quando é específico de uma view, fica na pasta dela.

---

## 2. File Map

| Arquivo | Responsabilidade | Consumidores |
|---|---|---|
| **Entry point** | | |
| `GenericTabbedView.tsx` | Orquestrador da Generic View (fallback para categorias sem view dedicada) | Roteador de categorias |
| **Top-level shared** | | |
| `SortSelect.tsx` | UI de sort por field + utility `sortRecords()` locale-aware | Todas filter bars + tabelas |
| `ViewModeToggle.tsx` | Toggle segmented icon-only, genérico via prop `options` | Planning, People |
| **components/** | | |
| `CategoryHeader.tsx` | Header padronizado (título + ações + portal + filter toggle + bottomRow) | Todas as views |
| `CategoryTabs.tsx` | Tab bar com temas (`purple`/`blue`/`indigo`/`gray`) | People, Planning, Generic |
| `FilterBar.tsx` | Container expansível horizontal de filtros | Todas filter bars |
| `FilterGroup.tsx` | Label + control wrapper para cada filtro | Todas filter bars |
| `FilterToggleButton.tsx` | Botão hide/show filter bar com badge de contagem | `CategoryHeader` |
| `GenericFilterBar.tsx` | Filter bar schema-driven (search + enum/boolean filters) | `GenericTabbedView` |
| `GenericRow.tsx` | Row dispatcher **por tipo de field** (não por nome) | `GenericTable` |
| `GenericTable.tsx` | Tabela schema-driven com sort/customize/delete | `GenericTabbedView` |
| `RelationCell.tsx` | Badge + popover para relation fields | `GenericRow`, todas as Row dedicadas |
| `RowActionsCell.tsx` | Edit + delete buttons padronizados | `GenericRow` + Products/Services/People/Expenses/UnitStock rows |
| **hooks/** | | |
| `useColumnSort.ts` | Lógica de sort por coluna (ciclo asc → desc → null) com suporte a `colToField` | 7 tabelas |
| `useFilterPersistence.ts` | Persiste estado de filter bar no localStorage | Todas as views |
| `useGenericData.tsx` | Data hook thin para Generic View (`useTableData` + lookups + delete) | `GenericTabbedView` |
| `useTableColumnControls.ts` | Resize, order e visibility de colunas com localStorage | 7 tabelas |
| **utils/** | | |
| `sortUtils.ts` | `getSchemaAllowedSortFields()` — derive sortable fields do schema | Filter bars |

---

## 3. Gold Standard Patterns (auditoria)

Esta pasta segue rigorosamente o standard:

| Padrão | Onde aplicado |
|---|---|
| **Zero `any` arbitrário** | `RowActionsCell` aceita `ITableSchema \| unknown` para compatibilidade entre callers heterogêneos. `sortRecords` usa `Record<string, unknown>`. |
| **EN fallbacks em todo `t()`** | Sem strings em PT espalhadas pelo código — fallbacks sempre em inglês. |
| **`useCallback` em handlers** | `handleColSort`, `handleDeleteConfirm`, `toggleColumn`, `moveColumn`, `resetColumns`, `toggle`, `handleQueryChange`, etc. |
| **`import type` para types** | `ITableSchema`, `ISchemaField`, `SortOption`, `ColumnDefinition`, etc. |
| **Locale-aware sem hardcode** | `sortRecords` usa `navigator.language` — não `'pt-BR'` literal. |
| **Console.error em EN** | `useTableColumnControls` reporta erros de localStorage em inglês. |
| **Zero dead code** | `useTableColumnControls` foi limpo: o `setSortColumn`/`sortConfig` internos (substituídos por `useColumnSort`) foram removidos. |
| **Hooks nunca após early return** | Verificado em todos os arquivos. |

---

## 4. Composição típica de uma category-view

```
CategoryView
├── CategoryHeader (com FilterToggleButton + portal + ViewModeToggle)
├── FilterBar (com FilterGroups)
├── CategoryTabs (se multi-table)
└── Table (usa useTableColumnControls + useColumnSort)
    ├── RelationCell (para fields type=relation)
    └── RowActionsCell (Edit + Delete)
```

Cada view dedicada (Products, Services, People, etc.) reusa esses blocos sem reimplementação. A `GenericTabbedView` é o **fallback** que monta tudo automaticamente a partir do schema.

---

## 5. useColumnSort — único hook de sort por coluna

Antes da auditoria, 7 tabelas tinham lógica de sort duplicada inline (ciclo `asc → desc → null`). Agora todas usam `useColumnSort`:

```tsx
const { isSortable, handleColSort, getColSortState } = useColumnSort(
    activeSortConfig ?? null,
    onSortChange ?? (() => {}),
    { colToField: COL_TO_FIELD }  // opcional
);
```

**Suporta `colToField`** para tabelas onde o ID da coluna exibida difere do nome do campo no backend (Services: `service` → `name`; People: `contact` → `email`).

**`nonSortableTypes` canônico:** `relation`, `boolean`, `json`, `textarea`, `actions`, `object`. `select`/`enum` permanecem sortáveis (útil em ERP).

---

## 6. ViewModeToggle — segmented toggle genérico

Aceita `options: Array<{ mode, icon }>` tipado genericamente:

```tsx
<ViewModeToggle<'grid' | 'list'>
  mode={viewMode}
  onChange={setViewMode}
  options={[
    { mode: 'grid', icon: <MdGridView size={18} /> },
    { mode: 'list', icon: <MdViewList size={18} /> },
  ]}
/>
```

Sem labels visuais — apenas ícones. Usado em Planning (`solid`/`explorer`) e People (`grid`/`list`).

**Não substitui** o toggle do `AnalyticsView` (Finance) — esse usa estilo pill com texto, propositalmente diferente.

---

## 7. Tech debt restante

- **`GenericTabbedView.tsx:198`** — `tableSchema={schema as any}` em `<FloatingActionButton>` com `eslint-disable` documentado. Débito do FAB externo (espera `any`), não da shared. Fix requer refactor do `FloatingActionButton`.

Nenhum outro débito conhecido.

---

## 8. Related docs

- **`GENERIC_VIEW.md`** (mesma pasta) — Documentação detalhada da Generic View (arquitetura, data flow, design decisions, extension recipes)
- **`category-view-standard`** skill (`~/.claude/skills/`) — Padrões teóricos que esta pasta implementa

---

_Última atualização: 2026-05-27 · Auditoria Gold Standard concluída._
