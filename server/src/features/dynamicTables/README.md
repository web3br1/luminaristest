# Feature: Dynamic Tables

Lets each user create and operate **their own tables with a custom schema**, without database
migrations. The whole definition lives as JSON and records are validated dynamically against that
schema. Governance (validation, immutability, state machine, anti-overlap, deletion rules) is
**declarative**: described in schema metadata and applied by a generic engine — so **any table,
including a user's custom one, works correctly without specific code**.

## The model in one sentence

There is no physical table per entity. There is `DynamicTable` (the **definition** — `schema` JSON) and
`DynamicTableData` (the **records** — a `data` JSON column). Each user "table" is a row in
`DynamicTable`; its records point to it. Everything is scoped by `userId`.

---

## 🗺️ Documentation map

Start with the doc for your need:

| You want to… | Read |
|---|---|
| Understand the data model, the operation lifecycle, the DTOs and preset installation | [`docs/architecture.md`](./docs/architecture.md) |
| Know **how and where** each rule runs (guards, advanced validation, no-overlap, system bypass) | [`docs/validation-and-governance.md`](./docs/validation-and-governance.md) |
| Work with **plugins** (contract, hooks, table detection, metadata×plugin boundary, catalog) | [`docs/rules-engine.md`](./docs/rules-engine.md) |
| **Author** tables/presets and the full reference for **each metadata** (fields → modules → systems) | [`presets/README.md`](./presets/README.md) |

> Division rule: `presets/README.md` is **what to declare** (authoring); `docs/validation-and-governance.md`
> is **how it executes**; `docs/rules-engine.md` is **plugins**; `docs/architecture.md` is **model/flow/contracts**.

---

## File structure

```
features/dynamicTables/
├── README.md                  # this index
├── docs/                      # architecture · validation-and-governance · rules-engine
├── dtos/                      # DynamicTable.dto.ts — Zod contracts (validation boundary)
├── models/                    # DynamicTable.model.ts — ITableSchema, ISchemaField, governance rules
├── policies/                  # IDynamicTablePolicy + DynamicTablePolicy (authorization)
├── repositories/              # IDynamicTableRepository + DynamicTableRepository (Prisma; indexed queries)
├── validation/                # SchemaValidator (Zod engine) + GovernanceEngine (guards + advanced rules + no-overlap)
├── services/                  # DynamicTableService (orchestrator) + PresetInstallerService (installation) + PresetService (catalog)
├── rules/                     # plugin engine: RuleRegistry, RuleTypes, shared/, plugins/ (+ plugins/sales/)
├── utils/                     # TableFactory (composes modules) + ValidationUtils (cpf/cnpj/phone)
└── presets/                   # fields/ · modules/ · systems/ + README (authoring reference)
```

---

## Core concepts (summary)

- **Dynamic validation:** `validation/SchemaValidator` builds a Zod validator at runtime
  (`buildZodSchema`) from the table's `schema`; `validation/GovernanceEngine` applies the guards and the
  advanced rules. `DynamicTableService` only orchestrates. Detail in
  [`docs/validation-and-governance.md`](./docs/validation-and-governance.md).
- **Declarative governance:** `readOnly`, `searchable`, `requiredIf` (field) and `deleteConstraints`,
  `compositeUnique`, `immutableAfter`, `compare`, `lifecycle`, `noOverlap`, `ui` (table). The **DTO**
  (`dtos/`) mirrors the **model** (`models/`), so the boundary validates and types all of the governance.
- **Plugin engine:** domain logic that is **not** declarable (cross-table side-effects, computed fields,
  checks against `now`). Plugins are opt-in via `supports()`. Detail in
  [`docs/rules-engine.md`](./docs/rules-engine.md).
- **Presets:** complete ERPs composed in 3 layers (fields → modules → systems), installed in 2 passes
  with relation resolution (`@@PRESET_TABLE_KEY::`). Detail in [`presets/README.md`](./presets/README.md).

---

## Authorization (summary)

`policies/DynamicTablePolicy.ts`: create/edit/delete of a table are system operations (blocked by
default for the direct user); `canManageData` allows **data** CRUD to the owner — except tables with
`ui.presentation: 'system'`, which are infra and never editable. The `*AsSystem` methods on the service
run without a policy for trusted flows (preset installation, seeds).

---

## API (HTTP routes)

All under `/api/dynamic-tables` (prefix protected by `authMiddleware`).

| Method | Path | Action |
|---|---|---|
| GET | `/` | Lists the user's tables |
| POST | `/lookup` | Resolves relation labels (`resolveRelations`) — `Cache-Control: private` |
| GET | `/:tableId` | Retrieves a table (authorizes via `canView`) |
| GET | `/:tableId/data` | Lists records (optional, additive pagination) |
| POST | `/:tableId/data` | Creates a record (validation + governance + plugins, in a transaction) |
| PUT | `/:tableId/data/:dataId` | Updates a record |
| DELETE | `/:tableId/data/:dataId` | Soft-delete + cascade of `deleteConstraints` |

> Creation/alteration of the **structure** (table/schema) has no public route: it is system
> (`*AsSystem`, preset installation, seeds).

## Invariants

- **Tier-0:** every read/mutation is scoped to the owner — the service authorizes (`getTableById`→`canView`,
  `findTableForData`→`canManageData`) **before** any access by `tableId`/`dataId`. The repository
  operates by raw id safely because the service is the gate.
- **`/lookup` is tenant-filtered:** `resolveRelations` authorizes the `tableId`, then resolves record ids
  via `findDataByIds` (a global PK lookup) and **filters the result to that table** — a caller cannot pass
  their own authorized `tableId` plus another tenant's record ids and read back labels.
- **Atomicity:** create/update/delete of data run in a single `prisma.$transaction` — a plugin failure
  rolls everything back (incl. cascades).
- **Delete-constraint scan is complete:** the referencer scan (`findRowsReferencingId`) is **unbounded**
  so `RESTRICT_IF_AGGREGATE` sums and `CASCADE` see every referencing row.
- **Safe system bypass:** `__isSystem` is only honored in non-production or for ADMIN.
- No `as any` in the controller; typed errors; `logger`.

## Internal decomposition (orchestrator + engines)

`DynamicTableService` is a **thin orchestrator** that delegates to injected collaborators:

| Collaborator | Responsibility |
|---|---|
| `validation/SchemaValidator` | `buildZodSchema` + `validateDataAgainstSchema` (pure) |
| `validation/GovernanceEngine` | guards `readOnly`/`immutableAfter`/`lifecycle` + `validateAdvancedRules` + `enforceNoOverlap` |
| `services/PresetInstallerService` | `installPresetAsSystem` (via the `ITableAuthoring` interface the service implements) |
| `rules/RuleRegistry` | resolves and runs the plugins per hook |

## Design decisions & exclusive variants (read before maintaining)

This feature deliberately diverges from the CRUD mold in several places. Each is intentional — keep them
unless you understand the trade-off you are changing.

- **Orchestrator-engine (not a thin CRUD service).** `DynamicTableService` combines CRUD + authorization
  + transaction orchestration; the validation/governance/preset logic lives in injected collaborators
  (`SchemaValidator`, `GovernanceEngine`, `PresetInstallerService`, `RuleRegistry`). *Why:* one generic
  engine governs every table, including a user's custom one, with zero per-table code.
- **Prisma in the service.** Data writes open `prisma.$transaction` directly (the service builds a
  tx-bound `DynamicTableRepository`), a justified exception to "only the repository touches Prisma".
  *Why:* the insert, the governance checks and the plugins (which may write other tables) must be **one
  atomic unit** — a plugin failure rolls the whole operation back, cascades included.
- **DTO of `data` is intentionally loose** (`z.record(string, z.any())`). *Why:* the real per-record
  validation is **dynamic** — `SchemaValidator.buildZodSchema` compiles a Zod validator from the table's
  own `schema` at runtime. A static DTO cannot know a user-defined table's shape. The *table definition*
  (`CreateDynamicTableDto`) is, by contrast, strictly validated.
- **Non-canonical policy.** `canManageData` authorizes **data** (rows), distinct from table **structure**;
  `canCreate/canUpdate/canDelete` (structure) always return `false` — structure is a system operation via
  the `*AsSystem` methods (preset install, seeds), never a user request. There is no `canListAll` (the
  list is scoped by `userId` directly). `ui.presentation: 'system'` tables are infra and locked even for
  the owner.
- **Declarative governance vs plugins.** Pure validation (presence/format/range/uniqueness/transition/
  anti-overlap/immutability) is **metadata** applied by the engine; **plugins** are only for
  side-effects, cross-table effects, computed fields and checks against the clock (`now`). Keep this
  boundary — a plugin re-validating declarative things is a smell. See `docs/rules-engine.md`.
- **Repository lookups are global-by-id, made safe by the service gate.** `findTableById`/`findDataById`/
  `findDataByIds` are not `userId`-scoped at the SQL level; the **service authorizes first**
  (`getTableById`→`canView`, `findTableForData`→`canManageData`) before any access. The one method that
  returns data resolved purely from caller-supplied ids — `resolveRelations` (`/lookup`) — additionally
  **filters rows to the authorized table** (it would otherwise leak labels across tenants).
- **`__isSystem` bypass.** A `data.__isSystem` flag skips the update guards + no-overlap, honored **only**
  in non-production or for an ADMIN. *Why:* trusted flows (plugins adjusting `stock`, seeds) must write
  protected fields without tripping user-facing guards. The Zod + advanced-rule validation still applies.
- **Two-pass preset install + `@@PRESET_TABLE_KEY::`.** A preset's cross-table relations are placeholders
  resolved in a second pass after all tables exist, inside one transaction. See
  `services/PresetInstallerService.ts` and `docs/architecture.md`.
- **Default data read is non-paginated (by choice); pagination is additive.** `GET /:tableId/data`
  without `?page/pageSize` returns the whole table (legacy shape `{ success, data }`) so existing clients
  are unaffected; passing `page/pageSize` switches to `{ success, data, total, page, pageSize }`
  (cap 1000). A large-table streaming path (`getTableDataStream`) exists for system reads.
- **Domain return shape.** Operations return `IDynamicTable`/rows (`data` JSON), not a fixed Response DTO
  — the data is dynamic by nature.

## Tests

The full gold suite (run via `npm test`):

| Level | File | Covers |
|---|---|---|
| Policy (unit) | `policies/__tests__/DynamicTablePolicy.spec.ts` | authorization matrix + the exclusive traits (structure ops always false; `canManageData` owner-only; `system` tables locked). |
| DTO (unit) | `dtos/__tests__/DynamicTable.dto.spec.ts` | the table-definition validation boundary (reserved names, select/relation rules, governance metadata shapes); the loose data DTO. |
| Service (integration) | `services/__tests__/DynamicTableService.integration.test.ts` | engine characterization — Tier-0, dynamic validation, full governance, `isSystem`, `beforeUpdate` mutation persistence, relations, `deleteConstraints`, preset install. |
| Plugins (integration) | `rules/__tests__/plugins.integration.test.ts` | one block per plugin (all 10), driving the real `$transaction` + hooks with each plugin's minimal table fixture. |
| HTTP/contract (integration) | `../../../controllers/__tests__/dynamicTables.routes.integration.test.ts` | 401/400/403, the `{ success, data }` envelope, additive pagination, and the `/lookup` cross-tenant **regression guard** (T0.1). |

> SalesPlugin's deep finalize side-effects (stock application, commission materialization, customer
> metrics, appointment auto-create) are covered when the **Sales preset ERP** is reviewed — that preset
> is their real fixture. The plugin logic independent of it (header guards, item XOR/no-mix,
> parent-finalized guard) is covered here.
