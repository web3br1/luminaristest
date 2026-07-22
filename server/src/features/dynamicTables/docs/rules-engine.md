# Rules Engine — Plugins

> The rule-plugin mechanism (`rules/`): contract, hooks, table detection, the metadata × plugin
> boundary, the current catalog and how to extend it.
> For declarative (non-plugin) validation, see [validation-and-governance.md](./validation-and-governance.md).

---

## 1. Contract

```typescript
// rules/RuleTypes.ts
interface RuleContext {
  userId: string;
  table: IDynamicTable;
  schema: ITableSchema;
  operation: 'create' | 'update' | 'delete';
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  repository: IDynamicTableRepository;
  isSystem?: boolean;
}

interface RulePlugin {
  name: string;
  supports(ctx: RuleContext): boolean;          // does this plugin apply to this table?
  beforeCreate?(ctx): Promise<void> | void;
  afterCreate?(ctx):  Promise<void> | void;
  beforeUpdate?(ctx): Promise<void> | void;     // mutating ctx.after PERSISTS
  afterUpdate?(ctx):  Promise<void> | void;
  beforeDelete?(ctx): Promise<void> | void;
  afterDelete?(ctx):  Promise<void> | void;
}
```

- **`RuleRegistry`** (`rules/RuleRegistry.ts`) holds the `globalRuleRegistry`; each plugin is registered
  once. `getApplicable(ctx)` returns the plugins whose `supports()` matches (errors in `supports` are
  swallowed → the plugin simply does not apply).
- **`DynamicTableService.runRules(ctx, phase)`** resolves and runs the applicable plugins for each hook.

> **Mutation in hooks:** in `beforeCreate`/`beforeUpdate`, writing to `ctx.after` is persisted (the
> service extracts the mutated object before writing). In `after*`/`*Delete`, the write has already
> happened.

---

## 2. Table detection — `tableMatches` and `resolveTable`

All detection lives in **`rules/shared/tableFinder.ts`** (single source of truth):

```typescript
// "does this table belong to plugin X?" — used by EVERY supports() and the resolveTable fallback
tableMatches(table, { internalNames, categories?, names? }): boolean
```
Rule: the category filters (if given) and then it matches by `internalName` (preset tables) **or** by a
known `name` (custom tables). Example of a standardized `supports()`:
```typescript
supports: (ctx) => tableMatches(ctx.table, {
  categories: ['planning'], internalNames: ['appointments'], names: ['Appointments'],
}),
```

```typescript
// resolve ANOTHER table in the workspace (e.g. SalesPlugin needs to find the commissions table)
resolveTable(ctx, { internalName, category?, names?, schemaMatch? }): Promise<IDynamicTable | null>
```
- **Fast path:** `findTableByInternalName` — indexed query (a preset has `internalName = presetKey`).
- **Fallback:** loads the tables once and matches by `tableMatches` or by a shape heuristic
  (`schemaMatch`), for custom tables without an `internalName`.

### Golden rule: indexed query, never full scan
Plugins **must not** use `findDataByTableId` + a JS filter. Use:
- `repository.findRowsByFieldValue(tableId, field, value)` — all rows where `data.field === value`
  (unbounded; safe for business collections).
- `repository.findDataById(id)` — lookup by PK.
- `repository.countByFieldValue` / `countOverlaps` — counts.

`findRowsReferencingId` is the delete-constraint referencer scan — indexed and **unbounded** (the former
`LIMIT 100` was removed so `RESTRICT_IF_AGGREGATE` sums and `CASCADE` are correct). It is still scoped to
"rows referencing this id"; for general business collections prefer `findRowsByFieldValue`.

---

## 3. The metadata × plugin boundary

| Declarative (NON-plugin) | Justifies a plugin |
|---|---|
| format/regex, ranges (`validation`), presence (`required`/`requiredIf`) | cross-table side-effects (create stock movements, materialize commissions) |
| simple/composite uniqueness (`unique`/`compositeUnique`) | computed fields (BANT score, goal `result`) |
| cross-field comparison (`compare`) | checks against the **clock** (don't complete an appointment before `endAt`) |
| state immutability (`immutableAfter`) | non-expressible cross logic (paymentStatus↔status in Sales) |
| status transitions (`lifecycle`) | orchestration across multiple tables |
| anti-overlap (`noOverlap`) | |

Since everything on the left is metadata, **custom tables inherit those rules without a plugin**.
Plugins removed because they became metadata: `GenericFieldValidation`, `Inventory`,
`FinancialBaselines`, `Campaigns`, `Expenses`, `OtherRevenues` (16 → 10 plugins).

---

## 4. Catalog (10 plugins)

| Plugin | Responsibility (what is left that is not declarative) |
|---|---|
| `SalesPlugin` | Sales orchestrator: items, stock/reservation, schedule, commissions, customer metrics (see §5). |
| `AppointmentsPlugin` | Checks vs `now` (past/future, complete only after `endAt`), customer, duration, working hours. |
| `CommissionsPlugin` | Only `autoStampPaidAt` (stamps `paidAt` when entering `Paid`). |
| `GoalsPlugin` | Only `autoComputeResult` (Reached/Partial/Not Reached). |
| `LeadsPlugin` | Pipeline/stage coherence, sequential transitions, BANT score, proposal snapshot, activities. |
| `LeadsSeedOnUnitPlugin` | Seeds a default pipeline+stages when a unit is created. |
| `ProductAutoStockPlugin` | Provisions stock rows (stock=0) per unit when a product is created. |
| `UnitAutoStockPlugin` | Provisions stock for all products when a unit is created. |
| `StockMovementsApplyPlugin` | Applies manual movements (In/Out) to the stock (excludes sale-generated ones). |
| `EmployeesPlugin` | `workSchedule` coherence and presence of unit/schedule. |

---

## 5. Anatomy of SalesPlugin (thin orchestrator + modules)

`SalesPlugin.ts` (~350 lines) only has `supports` + the 6 hooks, delegating to focused modules in
`rules/plugins/sales/`:

| Module | Responsibility |
|---|---|
| `shared.ts` | `SALE_KEYS` + `findSaleById` (shared). |
| `saleItems.ts` | item validation (product/service XOR, no-mix), `loadSaleItems`, finalized-sale guard. |
| `stockSync.ts` | reservations, stock deltas and movement generation. |
| `appointmentSync.ts` | coherence/auto-create/cancellation of the appointment for service items. |
| `commissions.ts` | materialization and reversal of commissions. |
| `customerMetrics.ts` | customer revenue aggregates + new/loyal flags. |

It is the template for how to break up a large plugin: thin hooks at the top, logic in cohesive modules,
internal finders via `resolveTable`.

> **Test coverage of SalesPlugin.** The header guards, sale-item XOR/no-mix and the finalized-sale guard
> are covered in `rules/__tests__/plugins.integration.test.ts` with a minimal `sales` + `saleItems`
> fixture (no inventory wiring). The deep finalize side-effects (stockSync, commission materialization,
> customerMetrics, appointmentSync) need the full interlocking Sales preset ERP and are covered when that
> preset is reviewed — their real fixture is the preset, not hand-built partial tables.

---

## 6. Tests

Every plugin has integration coverage in
[`rules/__tests__/plugins.integration.test.ts`](../rules/__tests__/plugins.integration.test.ts) — one
describe block per plugin, driving the real service write path (`$transaction` + hooks) with the minimal
set of tables each plugin detects. A test fails if a rule breaks. The engine/governance itself is locked
in [`services/__tests__/DynamicTableService.integration.test.ts`](../services/__tests__/DynamicTableService.integration.test.ts).

---

## 7. Recipes

### Add a plugin
1. Create `rules/plugins/MyPlugin.ts` exporting a `RulePlugin`.
2. `supports` with `tableMatches` (copy the exact categories/names).
3. Implement only the needed hooks; to read other tables, use `resolveTable` + indexed queries.
4. Register it in `rules/RuleRegistry.ts` (`globalRuleRegistry.register(MyPlugin)`).
5. JSDoc header: responsibility + a note "declarative validation lives in the schema; this plugin
   handles X".

### When **NOT** to write a plugin
If the rule is pure validation (presence, comparison, transition, uniqueness, format, anti-overlap), it
is **metadata** — declare it in the module schema (see [`../presets/README.md`](../presets/README.md))
and every table, including a user's custom one, inherits it for free. A plugin is only for
side-effect/cross-table/`now`.
