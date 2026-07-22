# Architecture — Dynamic Tables

> Data model, isolation, operation lifecycle, contracts (DTOs) and preset installation.
> For **what** to declare in metadata, see [`../presets/README.md`](../presets/README.md).
> For **how** the metadata executes, see [`validation-and-governance.md`](./validation-and-governance.md).

---

## 1. The "no physical table" model

The system **does not create a physical table per entity**. Everything lives in two physical tables (Prisma):

| Physical table | Role |
|---|---|
| `DynamicTable` | The **definition** of a user table: `name`, `category`, `internalName`, and the `schema` (JSON). |
| `DynamicTableData` | The **records**: each row has `dynamicTableId` + the `data` column (JSON) + `deletedAt` (soft delete). |

Each "table" the user sees (Products, Sales, Customers…) is a row in `DynamicTable` with its `schema`,
and its records are rows in `DynamicTableData` pointing to it. This lets each user have completely
different tables **without a database migration**.

### Per-user isolation
Each `DynamicTable` belongs to a `userId`. Uniqueness, search and relations are all scoped to that
specific table — "Maria's Salon" and "João's Barbershop" workspaces never cross. The policy
(`policies/DynamicTablePolicy.ts`) ensures a user only accesses what is theirs.

### `internalName` — the stable key
Tables installed from a preset get `internalName = <preset key>` (e.g. `'sales'`, `'saleItems'`,
`'commissions'`). That key is what allows resolving tables by an **indexed query** instead of scanning
all of them (see [rules-engine.md](./rules-engine.md) → `resolveTable`). Tables created from scratch may
have no `internalName`; in that case resolution falls back to a name/shape heuristic.

---

## 2. Lifecycle of data operations

All operations go through `services/DynamicTableService.ts`, which **orchestrates** the flow by
delegating schema validation to `validation/SchemaValidator`, the guards + advanced rules + no-overlap
to `validation/GovernanceEngine`, and the plugins to `rules/RuleRegistry`. Summary of **who calls what,
in what order** (the detail of each step is in
[validation-and-governance.md](./validation-and-governance.md)):

### `createTableData`
```
policy.canManageData
 → validateDataAgainstSchema   (dynamic Zod: required/format/validation)
 → validateAdvancedRules       (unique, relation, compositeUnique, requiredIf, compare)
 → enforceNoOverlap            (anti-overlap)
 → runRules('beforeCreate')    (plugins)
 → repository.createData
 → runRules('afterCreate')
```

### `updateTableData`
```
policy.canManageData
 → validateDataAgainstSchema   (validates the payload)
 → Guard 1: readOnly           (rejects changing a read-only field)
 → mergedData = {...existing, ...payload}
 → Guard 2: immutableAfter     (freezes fields/record by state)
 → Guard 3: lifecycle          (allowed status transitions)
 → validateAdvancedRules       (over the merged record)
 → enforceNoOverlap
 → runRules('beforeUpdate')    (plugins may mutate ctx.after — it is persisted)
 → repository.updateData(persistedData)
 → runRules('afterUpdate')
```

### `deleteTableData`
```
runRules('beforeDelete')
 → deleteConstraints           (RESTRICT / CASCADE / RESTRICT_IF_AGGREGATE / IGNORE)
 → repository.deleteData (soft delete)
 → runRules('afterDelete')
```

> **System bypass (`isSystem`):** writes originated by the system itself (plugins via
> `ctx.repository.*`, seeds) skip `readOnly`, `immutableAfter`, `lifecycle` and `noOverlap`. See the
> detail in [validation-and-governance.md](./validation-and-governance.md).

---

## 3. Contracts & API (DTOs)

Defined in `dtos/DynamicTable.dto.ts` (Zod). They are the **validation boundary**: the controller parses
the request against them before calling the service. Since the DTO↔model sync, `TableSchema` and
`AdvancedFieldSchema` declare **all** of the governance (mirroring `models/DynamicTable.model.ts`).

| DTO | Use |
|---|---|
| `CreateDynamicTableDto` | Create a table: `name`, `category`, `internalName?`, `schema` (fields + governance). |
| `UpdateDynamicTableDto` | Update simple metadata (name). |
| `UpdateDynamicTableSchemaDto` | Update the `schema` (used by the preset-installation flow). |
| `CreateDynamicTableDataDto` / `UpdateDynamicTableDataDto` | Create/update a **record**. `data` is a generic object; the real validation against the table schema is **dynamic** in the service (`validateDataAgainstSchema`). |

### Example — a custom table **with end-to-end governance**
```jsonc
{
  "name": "Room Bookings",
  "category": "planning",
  "schema": {
    "defaultDisplayField": "title",
    "fields": [
      { "name": "title",  "label": "Title",  "type": "string",   "required": true },
      { "name": "roomId", "label": "Room",   "type": "relation", "required": true,
        "relation": { "targetTable": "<rooms-table-id>" }, "searchable": false },
      { "name": "startAt","label": "Start",  "type": "datetime", "required": true },
      { "name": "endAt",  "label": "End",    "type": "datetime", "required": true },
      { "name": "status", "label": "Status", "type": "select",   "required": true,
        "options": ["Scheduled", "Done", "Cancelled"], "defaultValue": "Scheduled" }
    ],
    "compare":  [{ "left": "endAt", "op": "gt", "right": "startAt", "errorMessage": "End must be after the start." }],
    "lifecycle":[{ "field": "status", "transitions": { "Scheduled": ["Done", "Cancelled"] } }],
    "noOverlap":[{ "startField": "startAt", "endField": "endAt", "scopeFields": ["roomId"],
                   "errorMessage": "Room already booked for that period." }]
  }
}
```
This table **matches no plugin** (`supports()`), so it operates **100% on metadata**: the engine applies
`compare`, `lifecycle` and `noOverlap` automatically on create/update. It is the central use case for
custom tables.

---

## 4. Preset installation (2 passes)

`installPresetAsSystem` (delegated to `services/PresetInstallerService` via the `ITableAuthoring`
interface the service implements) assembles a complete ERP from modules (see
[`../presets/README.md`](../presets/README.md)). Since tables reference one another, installation runs
in two passes to resolve circular relations:

1. **Creation:** creates each `DynamicTable` with a **partial** schema (without the `relation` fields),
   and maps `preset-key → real-id`. Here `internalName = preset-key`.
2. **Resolution:** replaces each `@@PRESET_TABLE_KEY::<key>` with the real id and writes the full schema
   via `updateTableSchemaAsSystem`.

> The installation flow **passes the schema straight to the repository** (it does not re-parse via the
> DTO), so the governance defined in the modules (in TypeScript) is preserved in full.

---

## 5. Interaction with other features

- **`analytics`** — reads the user's table `schema`s (via `internalName`) to compute KPIs. Tables marked
  `ui.presentation: 'system'` (e.g. `analyticsDefinitions`) are analytics infra and neither appear in
  the views nor are editable by the user.
- **`kanban`** — cards are `DynamicTableData` of a dedicated dynamic table; the card structure is
  flexible because it is schema-driven.
- **`users`** — every `DynamicTable` is scoped to a `userId`; the `UserContext` drives the policy checks.

---

## 6. Feature file map

```
features/dynamicTables/
├── README.md                  # index (entry point)
├── docs/                      # this documentation set
│   ├── architecture.md
│   ├── validation-and-governance.md
│   └── rules-engine.md
├── dtos/                      # Zod contracts (validation boundary)
├── models/                    # TS interfaces (ITableSchema, ISchemaField, governance rules)
├── policies/                  # authorization (interface + impl)
├── repositories/              # data access (interface + Prisma impl; indexed queries)
├── validation/                # SchemaValidator + GovernanceEngine (engines extracted from the service)
├── services/                  # DynamicTableService (orchestrator) + PresetInstallerService + PresetService
├── rules/                     # plugin engine (RuleRegistry, RuleTypes, shared/, plugins/)
├── utils/                     # TableFactory (composes modules) + ValidationUtils (cpf/cnpj/phone)
└── presets/                   # fields → modules → systems + README (authoring reference)
```
