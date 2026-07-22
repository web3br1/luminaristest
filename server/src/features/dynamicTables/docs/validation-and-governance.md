# Validation & Governance — The Engine

> **How and where** each rule executes. `services/DynamicTableService.ts` **orchestrates**; the
> implementations live in `validation/SchemaValidator.ts` (dynamic Zod) and
> `validation/GovernanceEngine.ts` (the 3 guards + advanced rules + no-overlap). The flow order below is
> identical to the previous one. This doc is the execution complement to the authoring reference in
> [`../presets/README.md`](../presets/README.md) (§7–9, which describes **what** each metadata means).
>
> Core principle: **pure validation is declarative (metadata), applied by the generic engine**; plugins
> only step in for side-effects/cross-table/checks vs `now` (see [rules-engine.md](./rules-engine.md)).
> That is why **any table** — including a user's custom one — inherits all the governance with no code.

---

## 1. Execution order

### Create (`createTableData`)
| # | Step | What it does |
|---|---|---|
| 1 | `validateDataAgainstSchema` | dynamic Zod: `required`, `format`, `validation` (min/max). |
| 2 | `validateAdvancedRules` | unique · relation · compositeUnique · requiredIf · compare. |
| 3 | `enforceNoOverlap` | anti-overlap of periods. |
| 4 | `runRules('beforeCreate')` | plugins (mutation of `ctx.after` **persists**). |
| 5 | `repository.createData` | writes. |
| 6 | `runRules('afterCreate')` | plugins (post-write side-effects). |

### Update (`updateTableData`)
| # | Step | What it does |
|---|---|---|
| 1 | `validateDataAgainstSchema` | validates the payload. |
| 2 | **Guard 1 — readOnly** | rejects a payload that tries to change a `readOnly` field. |
| 3 | `mergedData = {...existing, ...payload}` | the full record state after the update. |
| 4 | **Guard 2 — immutableAfter** | freezes fields/record when the state condition is met. |
| 5 | **Guard 3 — lifecycle** | validates the status-field transition. |
| 6 | `validateAdvancedRules` | runs over `mergedData` (works on partial updates). |
| 7 | `enforceNoOverlap` | over `mergedData`, excluding the record itself. |
| 8 | `runRules('beforeUpdate')` | plugins (mutation of `ctx.after` **persists** — see §6). |
| 9 | `repository.updateData(persistedData)` | writes the mutated state. |
| 10 | `runRules('afterUpdate')` | plugins. |

### Delete (`deleteTableData`)
`runRules('beforeDelete')` → **deleteConstraints** → soft delete → `runRules('afterDelete')`.

> **`isSystem` bypass.** System writes (`(data as any).__isSystem`, or plugins writing via
> `ctx.repository.*`) **skip** Guard 1, Guard 2, Guard 3 and `enforceNoOverlap`. The system needs to
> adjust protected fields (e.g. `SalesPlugin` touches `stock`/`reserved`) and create records without
> tripping the guards. `validateAdvancedRules` and the Zod step still apply.

---

## 2. `validateDataAgainstSchema` (row data)

`buildZodSchema(schema)` builds a Zod validator **at runtime** from the `fields`, typing by
`field.type` and applying `required`, `format` (email/cpf/cnpj/phone/url), `regex`, `validation`
(minLength/maxLength/minValue/maxValue) and `options` (select). It is the only step that calls
`.parse()` over the record `data`. It **does not** know about table-level governance nor
`readOnly`/`searchable`/`requiredIf` — those are applied in the following steps.

---

## 3. `validateAdvancedRules` — 5 blocks

Runs on create (over `validatedData`) and update (over `mergedData`, so it sees the full record).
Receives `dataIdToExclude` on update so it does not conflict with itself.

| Block | Rule | Implementation |
|---|---|---|
| 1 | **unique** (field) | `repository.countByFieldValue(tableId, field, value, excludeId)` — indexed query. |
| 2 | **relation** (target existence) | `repository.existsByIdInTable(id, targetTable)`. |
| 3 | **compositeUnique** | scans the table and compares the field combination (debt: full scan; future improvement analogous to noOverlap). |
| 4 | **requiredIf** | for each field with `requiredIf`, evaluates the condition (`eq`/`neq`/`in`) over the record; if met and the field is empty → error. |
| 5 | **compare** | for each rule, reads `left`/`right`; **skips if either is missing**; types by `field.type` (date→timestamp, number→Number, otherwise→string); compares per `op`. |

---

## 4. The three Guards (update)

- **Guard 1 — `readOnly`** (field): if the payload tries to change a `readOnly` field, it rejects. This
  is backend enforcement (not just "hide it on the frontend").
- **Guard 2 — `immutableAfter`** (table): when `condition` (`eq`/`in`) is met by the **current** state,
  it blocks changes. `scope: 'all'` freezes the whole record; `scope: string[]` freezes only those
  fields. E.g. a `Paid` sale cannot have its `totalAmount` changed.
- **Guard 3 — `lifecycle`** (table): a state machine. Runs only on **update**; `prev → next` must be in
  `transitions[prev]`. States missing from the map are **terminal**. Same-state is a no-op. The initial
  state (on create) is validated by the select's `options`, not here.

`immutableAfter` + `lifecycle` complement each other: `lifecycle` says **where** the status can go;
`immutableAfter` (scope `'all'`) freezes the record once it reaches a terminal state.

---

## 5. `enforceNoOverlap` — anti-overlap

Runs on create and update; **`isSystem` bypass**. For each `noOverlap` rule:
- reads `startField`/`endField`; if either is missing/invalid (`Date` NaN), it **skips** (presence is
  the job of `required`/`compare`);
- builds the scope only from `scopeFields` present in the record;
- calls `repository.countOverlaps(...)` — a **SQL query** (`$queryRaw` + `datetime(json_extract(...))`),
  **not** a full scan. **Half-open** test: `existing.start < new.end AND existing.end > new.start`, so
  adjacent intervals do not conflict. `datetime()` normalizes timezones/ISO formats.

> **ISO normalization (fix):** the record bounds arrive as `Date` objects (`z.coerce.date`). The engine
> converts them with `toISOString()` before passing them to `$queryRaw` — `String(Date)` would produce a
> non-ISO format that SQLite's `datetime()` cannot parse (returns NULL), and the overlap would **never be
> detected**. Covered by a characterization test.

> `findRowsReferencingId` (used in the delete scan) is **unbounded** — it must return every referencing
> row so `RESTRICT_IF_AGGREGATE` sums and `CASCADE` are correct (a former `LIMIT 100` was removed, since
> truncation could under-count an aggregate → wrongly allow a delete, or leave referencers beyond 100 as
> orphans). The scan runs inside the delete `$transaction`. `countOverlaps`/`findRowsByFieldValue` are
> likewise unbounded. See [rules-engine.md](./rules-engine.md).

---

## 6. Persisting `beforeUpdate` mutations (fixed bug)

On update, the plugin context (`afterWithId`) is a copy of `mergedData` + `id`. Previously the service
persisted `mergedData` (not the mutated copy), so computed fields that plugins wrote into `ctx.after`
**were discarded on update** (they only worked on create). Fixed: the service extracts
`const { id, ...persistedData } = afterWithId` and persists `persistedData`. So mutations from
`GoalsPlugin` (result), `LeadsPlugin` (score), `SalesPlugin` (status/dueDate), `CommissionsPlugin`
(paidAt) etc. now persist on update.

---

## 7. `deleteConstraints` (delete)

Evaluated on delete over whoever **references** the record:

| `type` | Behavior |
|---|---|
| `RESTRICT` | blocks if there is any referencer. |
| `RESTRICT_IF_AGGREGATE` | blocks only if the sum of the referencers' `aggregate.field` satisfies `operator`+`value`. |
| `CASCADE` | soft-deletes the referencers (recursive, respecting their own constraints). |
| `IGNORE` | neither blocks nor cascades. |

**Default:** if a table references the record and there is no declared constraint, `RESTRICT` is applied
(protects against accidental deletion). The referencer scan uses `findRowsReferencingId` — an indexed,
**unbounded** query (no `LIMIT`), so aggregates and cascades see every referencing row.

---

## 8. Summary: where each metadata runs

| Metadata | Step | Operation | `isSystem` bypass? |
|---|---|---|---|
| `required`, `format`, `validation` | `validateDataAgainstSchema` | create, update | no |
| `unique`, `relation`, `compositeUnique`, `requiredIf`, `compare` | `validateAdvancedRules` | create, update | no |
| `readOnly` | Guard 1 | update | **yes** |
| `immutableAfter` | Guard 2 | update | **yes** |
| `lifecycle` | Guard 3 | update | **yes** |
| `noOverlap` | `enforceNoOverlap` | create, update | **yes** |
| `deleteConstraints` | delete | delete | — |
| `searchable` | frontend (`getSearchableFields`) | text search | — |
| `ui.presentation` | view router (`isNavigable`) + `canManageData` | navigation/write | — |
