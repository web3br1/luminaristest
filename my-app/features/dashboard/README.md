# features/dashboard — A feature principal

O dashboard é o coração do front: a partir da página [`pages/dashboard/index.tsx`](../../pages/dashboard/index.tsx)
(SSR carrega as tabelas do usuário), uma **sidebar de categorias** (`DashboardSidebar.tsx`) seleciona a
**view** correspondente. Cada categoria tem uma view especializada; o resto cai no padrão genérico.

> Visão geral da renderização dirigida por schema em [`ARCHITECTURE.md` §6–7](../../ARCHITECTURE.md).

## Mapa interno

| Área | O que é | Doc |
|---|---|---|
| `category-views/` | Views por categoria (finance, inventory, people, products, services, planning) + o padrão-ouro `GenericTabbedView`. | [índice abaixo](#category-views) |
| `components/forms/` | `DynamicForm` (form dirigido por schema) + `RelationSelector` + `dynamic-form-fields/`. | [components/README](./components/README.md) |
| `components/shared/` | Blocos schema-aware reutilizados pelos forms/views. | [README](./components/shared/README.md) |
| `shared/` | Primitivos, hooks e utils de UI do dashboard (paginação, lookups de relação, formatters). | [README](./shared/README.md) |

## category-views

| Categoria | Doc |
|---|---|
| finance | [README](./category-views/finance/README.md) · [SALES](./category-views/finance/SALES.md) · [EXPENSES](./category-views/finance/EXPENSES.md) · [SHARED](./category-views/finance/SHARED.md) |
| inventory | [README](./category-views/inventory/README.md) |
| people | [README](./category-views/people/README.md) |
| planning | [README](./category-views/planning/README.md) |
| products | [README](./category-views/products/README.md) |
| services | [README](./category-views/services/README.md) |
| shared (genérico) | [README](./category-views/shared/README.md) · [GENERIC_VIEW](./category-views/shared/GENERIC_VIEW.md) |

> `category-views/leads` e `category-views/kanban` existem mas estão **sem doc por enquanto** (em
> reavaliação — possível reforma/remoção).

## Fluxo (resumo)

`DashboardSidebar` (categoria) → a página renderiza a **view especializada** (`FinanceView`,
`PeopleView`, …) ou o **`GenericTabbedView`** como fallback → `useGenericData(tableId)` resolve
tabela+schema+registros+relações → `GenericTable` renderiza (FKs viram texto via relation lookups) →
CRUD via `DynamicForm` + `dynamic-table.service.ts`.
