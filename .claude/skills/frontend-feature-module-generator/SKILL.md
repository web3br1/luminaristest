---
name: frontend-feature-module-generator
description: Cria scaffold de módulo de feature no dashboard com View principal, hooks de dados e registro em pages/dashboard/index.tsx
argument-hint: "[nome-do-modulo] [categoria-erp]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Feature Module Generator

## Purpose

Cria a estrutura de um novo módulo de categoria no dashboard (`features/dashboard/category-views/<name>/`) com View principal, hooks de dados, e registra o dynamic import em `pages/dashboard/index.tsx`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Feature Module**.

> **Decisão bespoke-vs-canônico (anti-ilha):** antes de criar View/tabela/analytics próprios, responda `.claude/skills/_REUSE-CRITERION.md` (shape+posse) — mesmo shape+fonte de um canônico vivo (§0, ex. `GenericTabbedView`/`AnalyticsDashboard`) = **reuse**; diverge em shape ou posse = bespoke sancionado. É o único gate de reuso que o lint não pega.

## When to use

- Novo módulo de negócio precisa de visualização no dashboard
- Adicionando categoria ao sidebar de navegação
- Criando view específica para novo preset de tabela dinâmica

## Inputs

- `$ARGUMENTS[0]`: nome do módulo em kebab-case (ex: `appointments`)
- `$ARGUMENTS[1]`: categoria ERP (ex: `planning`, `finance`, `people`)

## Repository patterns to inspect first

```
my-app/features/dashboard/category-views/leads/                                 ← ⚠️ módulo LEGACY/monolítico (LeadsView 329 linhas, useLeadsView 251) — veja a estrutura de pastas, mas NÃO espelhe; mirror o stack canônico (GenericTabbedView) abaixo
my-app/features/dashboard/category-views/finance/FinanceView.tsx
my-app/pages/dashboard/index.tsx
my-app/features/dashboard/DashboardSidebar.tsx
my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx          ← orquestrador canônico (tabela + filtros + paginação + header)
my-app/features/dashboard/category-views/shared/components/GenericTable.tsx     ← tabela de registros (CRUD inline) — REUSE, não recrie
my-app/features/dashboard/shared/components/StandardPagination.tsx              ← paginação canônica (25/página)
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx` — orquestrador canônico de uma View de módulo: combina `GenericTable` (CRUD inline) + `GenericFilterBar` + `CategoryTabs` + `StandardPagination` (`ITEMS_PER_PAGE = 25`) num container full-height, com `useGenericData`, sort/filtro/colunas customizáveis e tudo memoizado (`useMemo`/`useCallback`). Leia ANTES de gerar — uma View nova deve reusar exatamente esses canônicos, não recriar tabela/paginação/layout. (NUNCA espelhe o módulo CRM: `RecordTable`/`CrmKpiCard`/`CrmBarChart` são o anti-exemplo "ilha".)

## Reuse os componentes canônicos (lição da revisão do CRM)

Uma View de lista NÃO deve construir tabela/paginação/layout do zero — reuse:
- **Tabela de registros** → `GenericTable` + `GenericRow` + `RowActionsCell` (CRUD inline add/edit/delete, filtros, sort, soft-delete, colunas customizáveis), tipicamente via `GenericTabbedView`. Detalhe de registro = MODAL (`Modal.tsx`, padrão `KanbanCardDetailModal`), nunca rota.
- **Paginação** → `StandardPagination` com fatiamento client-side (`ITEMS_PER_PAGE = 25`). Nunca `rows.map` sem paginar.
- **Container da View** → `flex h-full … flex-col` full-width (padrão de `GenericTabbedView`), com conteúdo scrollável interno. Não fixe `max-w-*` (telas irmãs ficam de tamanhos diferentes).
- **Analytics do módulo** → reuse `finance/components/analytics/dashboard/AnalyticsDashboard.tsx` + `DashboardKpiCard.tsx` + `charts/ChartRenderer.tsx`, não componentes de gráfico próprios.

O CRM ignorou tudo isso (criou `RecordTable`, `CrmKpiCard`, `CrmBarChart`, páginas com `max-w-*` divergentes, detalhe em rota) e ficou um módulo "ilha". Sempre prefira reusar.

## Generation contract

1. Diretório: `my-app/features/dashboard/category-views/<name>/`
2. View principal: `<Name>View.tsx` — FC exportada como **named export**
3. Sub-pastas: `components/`, `hooks/`
4. Hook de dados: `hooks/use<Name>Data.ts` — retorna `{ data, isLoading, error, refetch }`
5. Dynamic import em `pages/dashboard/index.tsx`:
   ```ts
   const <Name>View = dynamic(
     () => import('../../features/dashboard/category-views/<name>/<Name>View')
       .then(m => ({ default: m.<Name>View })),
     { ssr: false, loading: viewLoading }
   )
   ```
6. Registrar no switch de renderização do dashboard
7. Adicionar ao sidebar em `DashboardSidebar.tsx` se necessário
8. **Views agrupadas (Kanban/board/grouped-by-relação):** as colunas/grupos devem ser filtrados pelo **registro-pai ativo** (ex: etapas DO pipeline selecionado), nunca renderizar todos os registros da tabela-pai. Com múltiplos pais (2 pipelines, várias units) renderizar tudo gera **colunas duplicadas e vazias**. Defaulte para o pai com mais filhos e ofereça um seletor quando houver mais de um. Referência da correção: `my-app/features/crm/hooks/useCrmPipelineBoard.ts` (+ `CrmPipelineBoard.tsx`).

## Files usually created or changed

```
my-app/features/dashboard/category-views/<name>/<Name>View.tsx    ← NEW
my-app/features/dashboard/category-views/<name>/hooks/            ← NEW
my-app/features/dashboard/category-views/<name>/components/       ← NEW
my-app/pages/dashboard/index.tsx                                   ← EDIT (dynamic import + switch)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não importe a View diretamente na página — sempre via `dynamic()` com `ssr: false`
- Não coloque lógica de fetch na View — extraia para hook
- Não esqueça de registrar no switch do dashboard
- Não use default export na View se o módulo exporta múltiplas coisas — use named export
- **Não renderize um board agrupando por TODAS as etapas/relações** — filtre pelo pai ativo, senão múltiplos pais (pipelines/units) produzem colunas duplicadas. Sempre teste a view com >1 registro-pai.
- **Estilize as telas aplicando `frontend-design-system`** (tokens reais + componentes-assinatura) — Tailwind genérico (`zinc`/`rounded-xl`/`semibold`) deixa o módulo off-brand, fora do padrão do app.
- **Não recrie tabela/paginação/layout/analytics do zero** — reuse `GenericTable`/`GenericTabbedView`, `StandardPagination`, o container full-height e `AnalyticsDashboard`. Bespoke = módulo "ilha" (erro do CRM).
- **Não use rota `[id].tsx` para detalhe de registro** — use modal (`Modal.tsx`).
