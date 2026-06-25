---
name: frontend-widget-generator
description: Gera um widget de dashboard em my-app/components/widgets/<name>/<Name>Widget.tsx compatível com react-grid-layout (superfícies h-full/w-full, nunca px fixo), com os três estados explícitos loading/error/empty, props interface tipada (sem any) e integração de dados via DashboardDataContext (ou hook dedicado), estilizado no Galaxy theme (tokens neutral/lumi-*, nunca zinc). Use quando precisar de um novo tile/card/chart/tabela para o dashboard grid, um KPI card, um chart widget analítico ou um table widget de DynamicTable. Domínio/arquivos: my-app/components/widgets/<name>/<Name>Widget.tsx.
argument-hint: "[NomeDoWidget] [kpi|chart|table|calendar]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (my-app/ com React + Next.js Pages Router + react-grid-layout + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-WIDGET"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Frontend Widget Generator

## Purpose

Gera componentes de widget para o dashboard grid em `my-app/components/widgets/` ou dentro de `features/dashboard/`. Widgets devem ser self-contained, responsivos e compatíveis com `react-grid-layout`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Widget**.

> **Decisão bespoke-vs-canônico (anti-ilha):** antes de criar um widget de chart/KPI próprio, responda `.claude/skills/_REUSE-CRITERION.md` (shape+posse) — mesmo shape+fonte de um canônico vivo (§0, ex. `ChartRenderer`/`DashboardKpiCard`) = **reuse**; diverge em shape ou posse = bespoke sancionado. É o único gate de reuso que o lint não pega.

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

Cada item marcado `[FEWIDGET-*]` abaixo é uma REGRA DE GERAÇÃO auditável (espelha o widget canônico `AnalyticsWidget.tsx`). Gere já em conformidade.

1. Arquivo: `my-app/components/widgets/<name>/<Name>Widget.tsx`
2. **[FEWIDGET-006]** Props interface tipada e exportada: `interface <Name>WidgetProps { widgetId: string; title?: string; ... }` — **sem `any`**. O componente consome `<Name>WidgetProps`, nunca props soltas/`any`.
3. **[FEWIDGET-002]** Estado **loading**: enquanto o dado carrega (`isLoading`), renderize skeleton ou spinner — nunca o estado vazio nem dado parcial.
4. **[FEWIDGET-003]** Estado **error**: quando `error` truthy, renderize a mensagem de erro com **retry button** — não engula a falha.
5. **[FEWIDGET-004]** Estado **empty**: quando não há dados (`data.length === 0`), renderize mensagem descritiva de vazio — distinta de loading e de error.
6. **[FEWIDGET-005]** Dados via `DashboardDataContext` (hook `useDashboardData()`) ou hook dedicado. Quando o dado é compartilhado entre widgets (já carregado pelo dashboard), **leia de `DashboardDataContext`** (`import { useDashboardData } from '@/lib/context/DashboardDataContext'`) em vez de refazer o fetch no widget.
7. **Chart (tipo chart): reuse o `ChartRenderer` canônico antes de Recharts cru** (contrato §0: `.../components/analytics/.../charts/ChartRenderer.tsx`). Ele já encapsula `LineChart`/`BarChart`/`PieChart` com `ResponsiveContainer`, tokens de cor on-brand e tooltips padronizados. Só caia para Recharts direto se o `ChartRenderer` genuinamente não cobrir o caso — e justifique no relatório.
8. KPI (tipo kpi): mostrar `value`, `previousValue` e `trend` (up/down/neutral com cor). Reuse `DashboardKpiCard`/`KpiCard` canônico quando aplicável, não recrie o tile.
9. **Paginação ao ler DynamicTable:** se o widget (ou seu hook) lê `GET /dynamic-tables/:id/data`, ele retorna **só 50 linhas por padrão** (cap 200). Faça fetch-all até `totalPages` (`limit=200`) — senão o widget mostra contagem/KPI errado com volume. Ref: `features/crm/lib/crmFetch.ts` (`fetchAllRows`).
10. **Memoize dados derivados** (`filter`/`sort`/`group`/`reduce`/agregações) com `useMemo([deps])` — o widget re-renderiza a cada update do `DashboardDataContext`, inclusive os não relacionados.
11. **[FEWIDGET-001]** Responsividade **react-grid-layout-compatível**: a superfície raiz usa `h-full w-full` (respeitando `w`/`h` do layout em grids de 1-12 colunas) e **nunca** fixa dimensões em px — sem `w-[…px]`/`h-[…px]`/`style={{ width: …px }}`.
12. **[FEWIDGET-007]** Estilo **Galaxy theme**: superfícies e textos com tokens `neutral`/`lumi-*` (cards `rounded-2xl`/`3xl`). **Nunca** `zinc-*` nem Tailwind genérico fora do design system.
13. Export nomeado: `export const <Name>Widget = ...`

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
