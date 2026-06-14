---
name: dashboard-kpi-end-to-end-generator
description: Gera KPI completo ponta a ponta — backend processor + template + frontend KPI card widget + hook de dados analíticos
argument-hint: "[NomeDoKpi] [categoria]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Dashboard KPI End-to-End Generator

## Purpose

Orquestra a criação de um KPI completo: do backend analytics processor até o widget de KPI card no dashboard frontend. É a skill correta quando o usuário pede "quero ver X no dashboard".

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

### Frontend widget

7. Criar `my-app/features/dashboard/category-views/<cat>/components/kpi/<Name>KpiCard.tsx`
8. Seguir padrão de `components/widgets/analytics/KpiCard.tsx`
9. Exibir: valor atual, valor anterior, trend (up/down/neutral), label e unidade

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
