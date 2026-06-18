---
name: dashboard-kpi-end-to-end-generator
description: Gera KPI completo ponta a ponta — backend processor + template + frontend KPI card widget + hook de dados analíticos
argument-hint: "[NomeDoKpi] [categoria]"
allowed-tools: Read, Grep, Glob, Write, Edit
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

## Execution order

### Backend (aplicar contrato de `analytics-kpi-generator`)

1. Criar `server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts`
2. Criar `server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts`
3. Criar `__tests__/<Name>KpiProcessor.test.ts`
4. Registrar em `server/src/features/analytics/kpis/index.ts`

### Frontend hook

5. Criar `my-app/features/dashboard/category-views/<cat>/hooks/use<Name>Kpi.ts`
6. Hook chama `analytics.service.ts` com o KPI id correto

### Frontend widget — REUSE os componentes canônicos (não recrie gráficos próprios)

7. **Card de KPI** → reuse `DashboardKpiCard.tsx` (`features/dashboard/category-views/finance/components/analytics/dashboard/`) ou `widgets/analytics/GoldKpiWidgetView.tsx` para widgets do grid. Só crie um `<Name>KpiCard.tsx` próprio se o card canônico genuinamente não atender — e mesmo assim espelhe o layout dele.
8. **Gráficos** → reuse o orquestrador `charts/ChartRenderer.tsx` (delega a `PieDonutChart`/`BarLineAreaChart`, trata empty state via `NoDataCard`, aplica filtro temporal). NÃO escreva `CrmBarChart`/`CrmPieChart` próprios sobre Recharts cru — foi o erro do CRM.
9. **Board de analytics completo** (KPIs + charts + explicação + lista) → reuse o padrão de `analytics/dashboard/AnalyticsDashboard.tsx`: grid de cards por grupo de preset, linha de charts por tipo de KPI, e as explicações via `KpiInfoFooter`/`KpiTooltip`. Exibir no card: valor atual, valor anterior, trend (up/down/neutral), label e unidade.

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
