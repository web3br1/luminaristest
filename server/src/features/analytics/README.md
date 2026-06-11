# Feature: Analytics

Computes **KPIs and charts** over the user's dynamic tables. Analytics definitions come from two
sources — **code presets** (templates shipped with the app) and **CORE definitions** (data-driven,
stored in the user's `analyticsDefinitions` table) — and are resolved per user against their actual
tables and schemas.

> This README is the entry point. Deeper material lives in the sibling docs:
> - [`ANALYTICS_DOCUMENTATION.md`](./ANALYTICS_DOCUMENTATION.md) — technical reference (architecture, directory structure, processors).
> - [`ANALYTICS_TESTING_GUIDELINES.md`](./ANALYTICS_TESTING_GUIDELINES.md) — QA gold-standard / known pitfalls.
> - [`ANALYTICS_CALCULATIONS_PROPOSAL.md`](./ANALYTICS_CALCULATIONS_PROPOSAL.md) — design proposal for complex calculations.

---

## Service API (`AnalyticsService`)

| Method | Role |
|---|---|
| `getAllPresetGroupsAsync(userId, presetKeyFilter?)` | **Main entry.** Loads the user's tables (`getTablesForUser`), builds the code-driven groups **and** the CORE definitions, returns the merged preset groups. |
| `getDynamicPresetGroups(userTableMap, userTableSchemas, presetKeyFilter?)` | Builds groups from **code templates**, resolving each config against the user's tables/schemas. |
| `discoverKPIsAsync(userId, tableId)` | **Auto-discovers** KPIs for a given table based on its schema. |
| `getAllPresetGroups(_presetKeyFilter?)` | ⚠️ **DEPRECATED** — static, pre-dynamic variant kept for backward compatibility. Use the async version. |

Private helpers: `convertConfigurationsToGroups`, `getGroupTitle`, dependency check `isConfigSupported`.

---

## Key concepts

- **Code presets vs CORE definitions.** Code presets are TypeScript templates (`core/`, `kpis/`).
  **CORE definitions** are rows in the user's `analyticsDefinitions` table (a `dynamicTables` table with
  `ui.presentation: 'system'`), letting analytics be authored as **data**. They carry a **scope**:
  `global` | `preset` | `table`.
- **Pipeline sources.** A KPI's data source can be a `presetTable` (by preset key) or a concrete
  `tableId`, resolved per user.
- **Support gating.** `isConfigSupported()` only emits a config if its required tables/params/pipeline
  sources exist for that user — so users see only the KPIs their data actually supports.

---

## Structure

```
analytics/
├── README.md                  # this index
├── ANALYTICS_DOCUMENTATION.md # technical reference
├── ANALYTICS_TESTING_GUIDELINES.md
├── ANALYTICS_CALCULATIONS_PROPOSAL.md
├── services/                  # AnalyticsService + validators (AnalyticsValidator, AnalyticsDefinitionValidator)
├── core/                      # TemplateRegistry, AnalyticsConfiguration, AnalyticsTemplate, Pipeline, Compiler, ExpressionEvaluator
├── dynamic/                   # processors: FormulaCalculation, StatusComparison, AggregatePipeline, ...
└── kpis/                      # Revenue, Cost, Profit, Cashflow, Sales templates + processors
```

---

## Interaction with other features

- **[`dynamicTables`](../dynamicTables/README.md):** source of truth. Analytics reads user tables via
  `getTablesForUser(userId)` and their schemas; CORE definitions live in the `analyticsDefinitions`
  dynamic table.
- **`reports`:** consumes computed series to render charts.
