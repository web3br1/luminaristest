---
name: frontend-feature-module-generator
description: Cria o scaffold multi-arquivo de um módulo de feature no dashboard — View principal (named export) + hooks de dados + barrel `index.ts` público + registro do dynamic import em `pages/dashboard/index.tsx`. Mantém as fronteiras de camada do frontend: UI (View/components) consome STATE via hook, e o acesso a dados (service / DynamicTableService) vive no hook, nunca direto na View. Use ao criar um novo módulo de categoria em `features/dashboard/category-views/<name>/`, ao adicionar categoria ao sidebar, ou ao dar tela a um novo preset de tabela dinâmica. Domínio/arquivos: `my-app/features/dashboard/category-views/<name>/` (`<Name>View.tsx`, `hooks/use<Name>Data.ts`, `index.ts`) + `pages/dashboard/index.tsx`. NÃO use para uma rota/página standalone com auth guard + getServerSideProps — isso é `frontend-page-generator`.
argument-hint: "[nome-do-modulo] [categoria-erp]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (my-app/ com React + Next.js Pages Router + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-FEATMOD"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
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

Cada item marcado `[FEMOD-*]` abaixo é uma REGRA DE GERAÇÃO auditável. Gere já em conformidade.

1. **[FEMOD-001] Scaffold do módulo — View principal + hook de dados, separados.** Diretório `my-app/features/dashboard/category-views/<name>/` com sub-pastas `components/` e `hooks/`. View principal `<Name>View.tsx` exportada como **named export** (FC). Hook de dados `hooks/use<Name>Data.ts` retornando `{ data, isLoading, error, refetch }`. View e hook são arquivos distintos — a View NÃO declara fetch inline.
2. **[FEMOD-002] Barrel público `index.ts`.** O módulo expõe sua API pública por um único `index.ts` que **re-exporta a View** (`export { <Name>View } from './<Name>View'`) — esse é o ponto de import do resto do app, não o caminho profundo do arquivo. Hooks/components internos só são re-exportados se forem API pública intencional.
3. **[FEMOD-003] Fronteira de camada — UI consome STATE, não dados.** `<Name>View.tsx` (e os `components/`) consomem estado **via o hook** (`import { use<Name>Data } from './hooks/use<Name>Data'`) e **nunca** acessam dados diretamente: **proibido** `apiClient`, `fetch` cru ou `lib/services/*` na View. A View renderiza; o estado vem do hook.
4. **[FEMOD-004] Acesso a dados vive no hook.** O `use<Name>Data.ts` é a única camada do módulo que toca dados — importa o **service layer** (`lib/services/<...>.service`) ou `DynamicTableService` e expõe `{ data, isLoading, error, refetch }`. A fronteira UI↔dados fica entre `[FEMOD-003]` (View sem dados) e esta regra (hook com dados).
5. **[FEMOD-005] Registro do dynamic import em `pages/dashboard/index.tsx`** e no switch de renderização do dashboard:
   ```ts
   const <Name>View = dynamic(
     () => import('../../features/dashboard/category-views/<name>/<Name>View')
       .then(m => ({ default: m.<Name>View })),
     { ssr: false, loading: viewLoading }
   )
   ```
   A View entra no app **só** por `dynamic({ ssr: false })` — nunca import estático na página. Adicionar ao sidebar em `DashboardSidebar.tsx` quando necessário.
6. **Views agrupadas (Kanban/board/grouped-by-relação):** as colunas/grupos devem ser filtrados pelo **registro-pai ativo** (ex: etapas DO pipeline selecionado), nunca renderizar todos os registros da tabela-pai. Com múltiplos pais (2 pipelines, várias units) renderizar tudo gera **colunas duplicadas e vazias**. Defaulte para o pai com mais filhos e ofereça um seletor quando houver mais de um. Referência da correção: `my-app/features/crm/hooks/useCrmPipelineBoard.ts` (+ `CrmPipelineBoard.tsx`).

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

- Não importe a View diretamente na página — sempre via `dynamic()` com `ssr: false` (`[FEMOD-005]`)
- Não coloque lógica de fetch na View — extraia para o hook; `apiClient`/`fetch`/`lib/services` na View viola a fronteira (`[FEMOD-003]`); dados vivem no hook (`[FEMOD-004]`)
- Não importe o módulo pelo caminho profundo do arquivo — exponha a API pública pelo barrel `index.ts` (`[FEMOD-002]`)
- Não esqueça de registrar no switch do dashboard
- Não use default export na View se o módulo exporta múltiplas coisas — use named export
- **Não renderize um board agrupando por TODAS as etapas/relações** — filtre pelo pai ativo, senão múltiplos pais (pipelines/units) produzem colunas duplicadas. Sempre teste a view com >1 registro-pai.
- **Estilize as telas aplicando `frontend-design-system`** (tokens reais + componentes-assinatura) — Tailwind genérico (`zinc`/`rounded-xl`/`semibold`) deixa o módulo off-brand, fora do padrão do app.
- **Não recrie tabela/paginação/layout/analytics do zero** — reuse `GenericTable`/`GenericTabbedView`, `StandardPagination`, o container full-height e `AnalyticsDashboard`. Bespoke = módulo "ilha" (erro do CRM).
- **Não use rota `[id].tsx` para detalhe de registro** — use modal (`Modal.tsx`).
