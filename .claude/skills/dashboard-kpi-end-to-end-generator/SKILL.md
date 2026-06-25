---
name: dashboard-kpi-end-to-end-generator
description: Gera um KPI completo ponta a ponta — a CADEIA backend analytics processor (single-pass sobre rows → ChartDataPoint[]) + template registrado + hook de dados analíticos no frontend + KPI card widget que consome o hook e reusa o card canônico. Use quando o pedido envolve TODAS as camadas ("quero ver a métrica X no dashboard", "adicione um KPI de receita do backend ao frontend", "métrica nova ponta a ponta"). NÃO use para uma única camada: só processor backend → analytics-kpi-generator; só widget estático sem KPI → frontend-widget-generator. Domínio/arquivos: server/src/features/analytics/kpis/<category>/* + my-app/features/dashboard/category-views/<cat>/{hooks,components}/*.
argument-hint: "[NomeDoKpi] [categoria]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com Express + Prisma + analytics engine e Jest; my-app/ com React + Next.js Pages Router + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-DASHKPI"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Dashboard KPI End-to-End Generator

## Purpose

Orquestra a criação de um KPI completo: do backend analytics processor até o widget de KPI card no dashboard frontend. É a skill correta quando o usuário pede "quero ver X no dashboard".

## Contrato obrigatório

Esta skill gera múltiplas camadas (processor + template + hook + widget) — TODO arquivo gerado deve cumprir `.claude/skills/_ARCHITECTURE-CONTRACT.md` (single-pass + `addMoney` + `previousValue` undefined sem dados, frontend service layer, paginação ao ler DynamicTable, reuse de canônicos, design system, Empty Safety nos testes). O contrato é o gate final.

> **Decisão bespoke-vs-canônico (anti-ilha):** antes de criar card de KPI/gráfico próprio, responda `.claude/skills/_REUSE-CRITERION.md` (shape+posse) — mesmo shape+fonte de um canônico vivo (§0, `ChartRenderer`/`DashboardKpiCard`) = **reuse** (foi o erro de `CrmKpiCard`/`CrmBarChart`); diverge em shape ou posse = bespoke sancionado. É o único gate de reuso que o lint não pega.

## ⭐ Exemplo de referência canônico (espelhe este slice)

O vertical-slice ponta-a-ponta de KPI é a cadeia **processor → card canônico → ChartRenderer** — todos verificados e existentes:

```
server/src/features/analytics/kpis/revenue/RevenueKpiProcessor.ts                                   ← backend: single-pass, addMoney, previousValue undefined
server/src/features/analytics/kpis/revenue/RevenueKpiTemplate.ts                                     ← template do KPI
server/src/features/analytics/kpis/revenue/__tests__/RevenueKpiProcessor.test.ts                     ← teste (inclui Empty Safety)
my-app/features/dashboard/category-views/finance/components/analytics/dashboard/DashboardKpiCard.tsx ← card de KPI canônico (REUSE, não recrie)
my-app/features/dashboard/category-views/finance/components/analytics/charts/ChartRenderer.tsx       ← orquestrador de chart (REUSE, delega a PieDonut/BarLineArea + empty state)
my-app/features/dashboard/category-views/finance/components/analytics/dashboard/AnalyticsDashboard.tsx ← board completo (KPIs + charts + explicações)
```

Por que é o slice perfeito: `RevenueKpiProcessor` é o processor de referência (single-pass com `addMoney`, `previousValue` undefined sem dados) e `DashboardKpiCard`/`ChartRenderer` são os canônicos de UI que você REUSA — o erro do CRM (`CrmKpiCard`/`CrmBarChart` bespoke) foi justamente recriá-los.

## When to use

- Nova métrica de negócio precisa aparecer no dashboard
- Adicionando KPI a módulo de finance, sales, inventory, etc.
- KPI custom com fórmula definida pelo usuário

## Inputs

- `$ARGUMENTS[0]`: nome do KPI em PascalCase (ex: `TicketMedioPorPeriodo`)
- `$ARGUMENTS[1]`: categoria (ex: `revenue`, `sales`, `cost`)

## Generation contract

Cada item marcado `[DASHKPI-*]` abaixo é uma REGRA DE GERAÇÃO auditável. Esta skill gera uma **cadeia multi-arquivo** — o gate só fecha quando TODOS os elos existem e estão ligados (processor → template registrado → hook → widget que consome o hook). Gere já em conformidade.

### Backend (aplicar contrato de `analytics-kpi-generator`)

1. **[DASHKPI-001]** Criar `server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts` que **itera `rows` em single-pass** (um único loop, acumulando todas as métricas) e **retorna `ChartDataPoint[]`** (`import type { AnalyticsProcessor, ChartDataPoint } from '../../core'`; money via `addMoney()`, `previousValue` `undefined` sem dados). Múltiplos passes = FAIL.
2. **[DASHKPI-002]** Criar `server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts` e **registrar o KPI**: `registerProcessor('<key>', <name>KpiProcessor)` + `import './<Name>KpiTemplate'` no `kpis/<category>/index.ts` (e `import './<category>'` no `kpis/index.ts` se a categoria for nova). Sem registro o KPI é órfão.
3. Criar `__tests__/<Name>KpiProcessor.test.ts` (inclui Empty Safety — rows vazios → `0` finito, nunca `NaN`).

### Frontend hook

4. **[DASHKPI-003]** Criar `my-app/features/dashboard/category-views/<cat>/hooks/use<Name>Kpi.ts` que busca o dado **via service layer** — importa `analytics.service.ts` (ou consome `DashboardDataContext`) com o KPI id correto, expõe `data`/`isLoading`/`error`. NUNCA `apiClient`/`fetch` direto no hook nem valor hardcoded.

### Frontend widget — REUSE os componentes canônicos (não recrie gráficos próprios)

5. **[DASHKPI-004]** **Card de KPI** → criar `<Name>KpiCard.tsx` que **consome o hook `use<Name>Kpi`** (import) e **renderiza o card canônico `DashboardKpiCard`** (`features/dashboard/category-views/finance/components/analytics/dashboard/`) — ou `widgets/analytics/GoldKpiWidgetView.tsx` para widgets do grid. Só crie card próprio se o canônico genuinamente não atender; mesmo assim espelhe o layout e respeite o design system (`neutral-*`, **nunca** `zinc-*`). Exibir: valor atual, valor anterior, trend (up/down/neutral), label e unidade.
6. **Gráficos** → reuse o orquestrador `charts/ChartRenderer.tsx` (delega a `PieDonutChart`/`BarLineAreaChart`, trata empty state via `NoDataCard`, aplica filtro temporal). NÃO escreva `CrmBarChart`/`CrmPieChart` próprios sobre Recharts cru — foi o erro do CRM.
7. **[DASHKPI-005]** **Cadeia completa ligada** — o slice só está pronto quando o widget consome o hook, o hook bate na service que serve o KPI id do template, e o template referencia o processor registrado. Board de analytics completo (KPIs + charts + explicação) → reuse o padrão de `analytics/dashboard/AnalyticsDashboard.tsx` (grid de cards por grupo, charts por tipo, explicações via `KpiInfoFooter`/`KpiTooltip`). Um elo faltando (widget sem hook, hook sem processor, processor sem registro) = cadeia quebrada = FAIL.

## Sub-skills invocadas

- `analytics-kpi-generator` (passos 1-4)
- `frontend-hook-generator` (passo 5-6)
- `frontend-widget-generator` (passos 7-9)

## Files usually created or changed

```
server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts               ← NEW
server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts                ← NEW
server/src/features/analytics/kpis/<category>/__tests__/<Name>Processor.test.ts   ← NEW
server/src/features/analytics/kpis/index.ts                                        ← EDIT
my-app/features/dashboard/category-views/<cat>/hooks/use<Name>Kpi.ts              ← NEW
my-app/features/dashboard/category-views/<cat>/components/kpi/<Name>KpiCard.tsx   ← NEW
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd server && npx jest features/analytics/kpis/<category> --passWithNoTests
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não crie o widget sem o processor backend — o dado não chegará ao frontend
- Não hardcode valores no frontend — sempre via API call ao backend
- Não esqueça os estados loading/error no KPI card
- Não pule o teste do processor — é a única verificação automatizada do cálculo
- **Não crie componentes de gráfico próprios** (`<Modulo>BarChart`/`PieChart` sobre Recharts cru) — reuse `ChartRenderer`. Bespoke ignora empty state, filtro temporal e padrão visual (erro do CRM).
- **Não crie um KPI card do zero** se `DashboardKpiCard`/`GoldKpiWidgetView` servem — reuse antes de recriar.
