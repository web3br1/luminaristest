---
name: frontend-widget-generator
description: Gera widget de dashboard compatível com react-grid-layout, com estados loading/error/empty e integração com DashboardDataContext
argument-hint: "[NomeDoWidget] [kpi|chart|table|calendar]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Widget Generator

## Purpose

Gera componentes de widget para o dashboard grid em `my-app/components/widgets/` ou dentro de `features/dashboard/`. Widgets devem ser self-contained, responsivos e compatíveis com `react-grid-layout`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Widget**.

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
my-app/components/widgets/analytics/AnalyticsWidget.tsx
my-app/components/widgets/analytics/GoldKpiWidgetView.tsx
my-app/components/widgets/dashboard-grid/dashboard-grid.tsx
my-app/lib/context/DashboardDataContext.tsx
my-app/features/dashboard/category-views/finance/components/analytics/charts/ChartRenderer.tsx
my-app/features/dashboard/category-views/finance/components/analytics/dashboard/DashboardKpiCard.tsx
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`my-app/components/widgets/analytics/AnalyticsWidget.tsx` — widget canônico do grid: trata loading/empty/configuração, consome dados via hook (`useWidgetAnalyticsData`), memoiza todo dado derivado (`chartPreset`/`targetKpi`/`titleText`) e renderiza chart via `ChartRenderer` + KPI via `GoldKpiWidgetView` (nunca Recharts cru), com superfícies `neutral` e `h-full w-full` para o react-grid-layout. Leia-o ANTES de gerar. (Para tabela/analytics/modal: NUNCA espelhe os equivalentes do CRM — `CrmKpiCard`/`CrmBarChart` são o anti-exemplo.)

## Generation contract

1. Arquivo: `my-app/components/widgets/<name>/<Name>Widget.tsx`
2. Props interface: `interface <Name>WidgetProps { widgetId: string; title?: string; ... }`
3. Estado loading: mostrar skeleton ou spinner durante fetch
4. Estado error: mostrar mensagem de erro com retry button
5. Estado empty: mensagem descritiva quando sem dados
6. Dados: consumir via hook dedicado ou `DashboardDataContext`. Quando o dado é compartilhado entre widgets (já carregado pelo dashboard), **leia de `DashboardDataContext`** em vez de refazer o fetch no widget.
7. **Chart (tipo chart): reuse o `ChartRenderer` canônico antes de Recharts cru** (contrato §0: `.../components/analytics/.../charts/ChartRenderer.tsx`). Ele já encapsula `LineChart`/`BarChart`/`PieChart` com `ResponsiveContainer`, tokens de cor on-brand e tooltips padronizados. Só caia para Recharts direto se o `ChartRenderer` genuinamente não cobrir o caso — e justifique no relatório.
8. KPI (tipo kpi): mostrar `value`, `previousValue` e `trend` (up/down/neutral com cor). Reuse `DashboardKpiCard`/`KpiCard` canônico quando aplicável, não recrie o tile.
9. **Paginação ao ler DynamicTable:** se o widget (ou seu hook) lê `GET /dynamic-tables/:id/data`, ele retorna **só 50 linhas por padrão** (cap 200). Faça fetch-all até `totalPages` (`limit=200`) — senão o widget mostra contagem/KPI errado com volume. Ref: `features/crm/lib/crmFetch.ts` (`fetchAllRows`).
10. **Memoize dados derivados** (`filter`/`sort`/`group`/`reduce`/agregações) com `useMemo([deps])` — o widget re-renderiza a cada update do `DashboardDataContext`, inclusive os não relacionados.
11. Responsividade: funcionar em grids de 1-12 colunas do `react-grid-layout` — respeitar `w`/`h` do layout e nunca fixar dimensões em px (usar `%`/`h-full`/unidades do grid).
12. Export nomeado: `export const <Name>Widget = ...`

## Files usually created or changed

```
my-app/components/widgets/<name>/<Name>Widget.tsx    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não faça fetch dentro do widget — use hook ou context (leia de `DashboardDataContext` quando o dado for compartilhado)
- Não ignore estados de loading, error **e empty** — trate os três explicitamente; UX quebra sem eles
- Não use larguras/alturas fixas em px — use `%`/`h-full`/unidades do grid; respeite `w`/`h` do `react-grid-layout`
- **Não vá direto para Recharts cru em chart widget** — reuse `ChartRenderer` canônico (contrato §0) antes; Recharts direto só com justificativa
- Não importe Recharts sem verificar SSR — use `dynamic()` ou guard `typeof window !== 'undefined'`
- **Não leia DynamicTable sem paginar** — a API retorna só 50 linhas; faça fetch-all (`limit=200` até `totalPages`) ou o widget trunca/conta errado com volume
- Não omita a interface de props (`interface <Name>WidgetProps`) nem use `any`
- Não calcule dados derivados sem `useMemo([deps])` — o widget re-renderiza a cada update do `DashboardDataContext`
- **Estilize aplicando `frontend-design-system`** (tokens `neutral`/`lumi-*`, KPI tiles, badges, score gauge) — não use `zinc`/Tailwind genérico
