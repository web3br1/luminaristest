---
name: frontend-widget-generator
description: Gera widget de dashboard compatível com react-grid-layout, com estados loading/error/empty e integração com DashboardDataContext
argument-hint: "[NomeDoWidget] [kpi|chart|table|calendar]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Widget Generator

## Purpose

Gera componentes de widget para o dashboard grid em `my-app/components/widgets/` ou dentro de `features/dashboard/`. Widgets devem ser self-contained, responsivos e compatíveis com `react-grid-layout`.

## When to use

- Novo tipo de widget para o dashboard
- KPI card com dado específico
- Chart widget com dados analíticos
- Table widget mostrando dados de tabela dinâmica

## Inputs

- `$ARGUMENTS[0]`: nome do widget em PascalCase (ex: `AppointmentsCalendar`)
- `$ARGUMENTS[1]`: tipo: `kpi` | `chart` | `table` | `calendar` | `default`

## Repository patterns to inspect first

```
my-app/components/widgets/analytics/KpiCard.tsx
my-app/components/widgets/analytics/AnalyticsChart.tsx
my-app/components/widgets/dashboard-grid/DashboardGrid.tsx
my-app/lib/context/DashboardDataContext.tsx
my-app/features/dashboard/category-views/finance/components/analytics/
```

## Generation contract

1. Arquivo: `my-app/components/widgets/<name>/<Name>Widget.tsx`
2. Props interface: `interface <Name>WidgetProps { widgetId: string; title?: string; ... }`
3. Estado loading: mostrar skeleton ou spinner durante fetch
4. Estado error: mostrar mensagem de erro com retry button
5. Estado empty: mensagem descritiva quando sem dados
6. Dados: consumir via hook dedicado ou `DashboardDataContext`
7. Chart (tipo chart): usar `Recharts` — `LineChart`, `BarChart`, `PieChart` com `ResponsiveContainer`
8. KPI (tipo kpi): mostrar `value`, `previousValue` e `trend` (up/down/neutral com cor)
9. Responsividade: funcionar em grids de 1-12 colunas do `react-grid-layout`
10. Export nomeado: `export const <Name>Widget = ...`

## Files usually created or changed

```
my-app/components/widgets/<name>/<Name>Widget.tsx    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não faça fetch dentro do widget — use hook ou context
- Não ignore estados de loading e error — UX quebra sem eles
- Não use larguras/alturas fixas em px — use `%` ou unidades do grid
- Não importe Recharts sem verificar SSR — use `dynamic()` ou guard `typeof window !== 'undefined'`
- **Estilize aplicando `frontend-design-system`** (tokens `neutral`/`lumi-*`, KPI tiles, badges, score gauge) — não use `zinc`/Tailwind genérico
