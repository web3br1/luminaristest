# Preset Ecosystem — Dynamic Tables

> 📍 Part of the feature's doc set — see the [documentation map](../README.md#️-documentation-map).
> This file is the **authoring** reference (what to declare). For **how/where** each metadata executes,
> see [`../docs/validation-and-governance.md`](../docs/validation-and-governance.md);
> for **plugins**, see [`../docs/rules-engine.md`](../docs/rules-engine.md).

This document is the complete reference for the preset system. It explains how dynamic tables are
defined, how presets compose in layers, and **every available metadata** with real examples.

> **Language convention:** prose, comments and this document are in **English**. Field `label` and
> `description` values are also in **English** — the frontend translates via i18n
> (`database:fields.<name>`) with a fallback to the English label.

---

## 1. How the data works (overview)

The system **does not create a physical table per entity**. Instead:

- There is a physical `DynamicTable` table — holds the **definition** (the schema) as JSON.
- There is a physical `DynamicTableData` table — holds the **records**, with the `data` column in JSON.

Each "table" the user sees (Products, Sales, Customers…) is a row in `DynamicTable` with its schema, and
its records are rows in `DynamicTableData` pointing to it. This lets each user have completely different
tables without a database migration.

**Isolation:** each `DynamicTable` belongs to a `userId`. Uniqueness, search and relations are all
scoped to that specific table — "Maria's Salon" and "João's Barbershop" never cross.

---

## 2. The 3-layer architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEMS  (presets/systems/)                                 │
│  A complete ERP. E.g. BeautySalonPreset = 16 tables.         │
│  Composes MODULES via createTableFromModule().               │
└────────────────────────────┬────────────────────────────────┘
                             │ uses
┌────────────────────────────▼────────────────────────────────┐
│  MODULES  (presets/modules/)                                 │
│  One table. E.g. productModule, salesModule.                 │
│  Composes FIELDS (presets + overrides + inline fields).      │
└────────────────────────────┬────────────────────────────────┘
                             │ uses
┌────────────────────────────▼────────────────────────────────┐
│  FIELDS  (presets/fields/)                                   │
│  One reusable field. E.g. salePrice, customerId, date.       │
│  Pure ISchemaField objects, grouped by type.                 │
└──────────────────────────────────────────────────────────────┘
```

**Golden rule:** the lower in the stack, the more reusable. Whenever a field is generic (price, date, a
customers FK), use the **field preset**. Only declare inline what is specific to that table.

---

## 3. FIELDS — field presets

They live in `presets/fields/`, grouped by type:

| File | Contains |
|---|---|
| `text/TextPresets.ts` | `name`, `description`, `notes`, `email`, `phone`, `sku`, `brand`, address, etc. |
| `number/NumberPresets.ts` | `amount`, `price`, `salePrice`, `costPrice`, `quantity`, `stock`, `commission`, etc. |
| `date/DatePresets.ts` | `date`, `dueDate`, `paymentDate`, `startAtDateTime`, `dateRange`, etc. |
| `boolean/BooleanPresets.ts` | `isActive`, `isPlanned`, `simpleCustomerFlag` |
| `select/SelectPresets.ts` | `saleStatus`, `paymentStatus`, `paymentMethod`, `appointmentStatus`, etc. |
| `relation/RelationPresets.ts` | `unitId`, `customerId`, `productId`, `serviceId`, `saleId`, etc. |

Each preset is an `ISchemaField` object:

```typescript
export const salePrice: ISchemaField = {
  name: 'salePrice',
  label: 'Sale Price',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};
```

They are all re-exported by the barrel `presets/fields/index.ts`, so a module imports from one place:

```typescript
import { salePrice, customerId, date } from '../../fields';
```

### Override via spread

Field presets are immutable by convention. To tweak a field in a module, use spread and override only
what changes:

```typescript
{ ...customerId, required: false }          // makes the FK optional
{ ...unitId, label: 'Business Unit' }       // changes only the label
{ ...date, label: 'Sale Date' }             // reuses the 'date' field with a different label
```

> `createTableFromModule` deep-clones (`JSON.parse(JSON.stringify())`), so neither the spread nor the
> installation mutates the original preset.

### `dateRange` — a preset that is an array

`dateRange` exports **two fields** (`startDate` + `endDate`). Spread it directly into the fields array:

```typescript
import { dateRange } from '../../fields';
fields: [
  ...dateRange,   // injects startDate and endDate
]
```

---

## 4. MODULES — table presets

They live in `presets/modules/<category>/`. Each module describes **one table**:

```typescript
import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, brand, sku, usageType } from '../../fields';

export const productModule = {
  name: 'Products',                       // display name
  description: 'Master catalog of all products offered.',
  category: 'products',                   // category (see TableCategories.ts)
  meta: {                                 // dependency injection (optional)
    providesCapabilities: ['catalog.products'],
  },
  schema: {
    defaultDisplayField: 'name',
    fields: [
      name,
      brand,
      sku,
      { name: 'category', label: 'Category', type: 'string', required: false },
      usageType,
    ],
    deleteConstraints: [ /* ... */ ],
  } as ITableSchema,
};
```

| Property | Required | Description |
|---|---|---|
| `name` | ✅ | The table's display name. |
| `description` | ✅ | Short description (used in the install UI and by the AI). |
| `category` | ✅ | Groups tables. Valid values in `models/TableCategories.ts`. |
| `meta` | ➖ | Capabilities and dependencies (see §6). |
| `schema` | ✅ | Structure: `defaultDisplayField`, `fields`, and governance metadata. |
| `analytics` | ➖ | Pre-built KPI/chart configuration for the table. |

---

## 5. SYSTEMS — system presets

They live in `presets/systems/`. A system is a complete ERP, composed of modules via
`createTableFromModule()`:

```typescript
import { createTableFromModule } from '../../utils/TableFactory';
import { customerModule } from '../modules/people/CustomerModule';
import { productModule, productUnitModule } from '../modules/product/ProductModule';
// ...

const BeautySalonPreset = {
  key: 'beautySalon',
  name: 'Advanced ERP for Beauty Salons',
  description: 'Complete solution for salon management...',
  tables: {
    customers:    createTableFromModule(customerModule),
    products:     createTableFromModule(productModule),
    productUnits: createTableFromModule(productUnitModule),
    // ... the key (e.g. 'customers') is the table identifier within the preset
  },
};

export default BeautySalonPreset;
```

The **key** of each entry in `tables` (e.g. `customers`, `products`) is what the `@@PRESET_TABLE_KEY::`
marker references (see §8).

### `createTableFromModule(module, config?)`

Turns a module into an installable table definition. The optional second argument allows customization:

```typescript
createTableFromModule(productModule, {
  omit: ['brand'],                                  // removes fields
  add: [{ name: 'warranty', label: 'Warranty', type: 'string', required: false }],
})
```

### System types

| System | Role |
|---|---|
| `CoreSystemPreset` | **Mandatory base.** Installed for every user. Contains `units`, `employees`, `tasks`, `leads`, etc. Every other preset depends on it. |
| `BeautySalonPreset` | A complete example preset (beauty salon). Uses the 16 business modules. |

---

## 6. MODULE metadata — `meta` (capabilities)

`meta` declares the dependency contract between tables. Resolved at preset installation
(`DynamicTableService.installPresetAsSystem`).

```typescript
meta: {
  providesCapabilities: ['inventory.stock'],   // "I provide this"
  requiresCapabilities: ['inventory.stock'],   // "I need someone to provide this"
  requiresTables: ['saleItems'],               // "I need this table by name"
  excludesTables: ['saleItemsServicesOnly'],   // "I am incompatible with this one"
}
```

| Field | Description |
|---|---|
| `providesCapabilities` | Capabilities the table provides. A free string like `'inventory.stock'`. |
| `requiresCapabilities` | Requires that **some** table in the preset provides these capabilities. If missing, installation fails. |
| `requiresTables` | Requires the presence of specific tables by their key-name. A hard dependency. |
| `excludesTables` | Declares incompatibility with other tables. |

**Why capabilities > requiresTables:** capabilities allow substitution. If tomorrow you create
`warehouseStock` that also declares `providesCapabilities: ['inventory.stock']`, any module that requires
that capability accepts the new module without any change. `requiresTables` locks you to the name.

**Real example:** `stockMovementsModule` declares `requiresCapabilities: ['inventory.stock']`. If you
install a preset with stock movements but no table that provides `inventory.stock` (e.g. without
`productUnits`), the installation is rejected.

---

## 7. FIELD metadata (`ISchemaField`)

Full reference of every attribute of a field. Canonical definition in `models/DynamicTable.model.ts`.

### 7.1 Identification and type

| Attribute | Type | Description |
|---|---|---|
| `name` | `string` ✅ | The field key in the record JSON. Unique within the table. camelCase. **Never change it once in production** — it is the key of the stored data. |
| `label` | `string` ✅ | Display label (EN; i18n on the frontend). |
| `type` | `string` ✅ | `string` \| `number` \| `boolean` \| `date` \| `datetime` \| `relation` \| `select` \| `textarea` \| `json` |
| `description` | `string` ➖ | Help/tooltip text in the form. |

### 7.2 Formatting

| Attribute | Applies to | Description |
|---|---|---|
| `format` | `type: 'string'` | Mask/validation: `email`, `phone`, `cpf`, `cnpj`, `url`, `custom`. Validated declaratively in `buildZodSchema` (`DynamicTableService`), for any table. |
| `numberFormat` | `type: 'number'` | Rendering: `currency`, `percentage`, `integer`, `decimal`. Affects how the frontend formats it ($, %, etc.). |
| `options` | `type: 'select'` | List of options. E.g. `['Paid', 'Pending']`. |

### 7.3 Input behavior

| Attribute | Type | Description |
|---|---|---|
| `required` | `boolean` ✅ | If `true`, does not accept null/empty. |
| `unique` | `boolean` ➖ | Unique value in the table. Checked on the backend (create and update). |
| `defaultValue` | `any` ➖ | Initial value. Can be a literal or `'CURRENT_TIMESTAMP'`. |
| `hidden` | `boolean` ➖ | If `true`, **does not appear in the form** (`DynamicForm` filters it out). Useful for internal fields like `detailKey`, `order`. |
| `validation` | `object` ➖ | Rules: `{ minLength, maxLength, minValue, maxValue }`. |

### 7.4 Field governance

| Attribute | Type | Description |
|---|---|---|
| `readOnly` | `boolean` ➖ | If `true`, the backend **rejects** any update that tries to change this field (except system processes). The frontend shows the field disabled with a "(Read only)" label. |
| `searchable` | `boolean` ➖ | If `false`, the field is **excluded from the global text search**. Default: `true`. |
| `requiredIf` | `object` ➖ | Makes the field **conditionally required** based on another field's value. Validated on the backend (create and update) over the full record. |

#### About `readOnly`

Use it on fields that can only be changed by system logic, never by the direct user. Real example
(`productUnitModule`):

```typescript
{ ...stock, readOnly: true },    // stock only changes via StockMovements
{ name: 'reserved', ..., readOnly: true },  // reserved only changes via SalesPlugin
```

Enforcement is in `updateTableData` (Guard 1). Trying to edit via the direct API, mobile or any client
is blocked — it is not just "hide it on the frontend".

#### About `searchable`

The frontend's global text search filters by `searchable !== false`. Mark `false` on fields whose
content pollutes the search:

- **Always `false`:** relations (they are CUIDs), numbers (prices become noise), dates (dates produce
  false positives), booleans.
- **Case-by-case for `select`:** states the user naturally searches for (`paymentStatus`,
  `paymentMethod`) ideally stay `searchable: true` to allow typing "paid" or "pix". Internal/analytical
  selects stay `false`.
- **Keep searchable (no flag):** `name`, `sku`, `email`, `brand`, `description`, `notes`.

> ⚠️ **Date search ≠ text search.** Searching records by date range is not done by the text search — it
> requires a dedicated datepicker filter in the filter bar. Marking the date as `searchable: false` is
> correct; period search is a separate feature to be implemented in the filter bars.

#### About `requiredIf`

Makes a field required **only when** another field meets a condition. Presence is evaluated over the
**full record** (existing + payload merge), so it works on partial updates. Validated in
`validateAdvancedRules`.

```typescript
// ExpensesModule: the payment date is only required when the expense is paid
{ ...paymentDate, required: false,
  requiredIf: { field: 'paymentStatus', op: 'eq', value: 'Paid' } }

// OtherRevenuesModule: the source is only required for certain revenue types
{ name: 'source', required: false,
  requiredIf: { field: 'type', op: 'in', value: ['Interest', 'Rent', 'Resale'] } }
```

| `requiredIf` field | Description |
|---|---|
| `field` | Name of the field whose value is evaluated. |
| `op` | `eq` (equal), `neq` (not equal) or `in` (is in the list). |
| `value` | A single value (`'Paid'`, `true`) or an array (for `in`). |

> **Pattern:** declare the field as `required: false` and let `requiredIf` handle the conditional
> requirement. This fixes the classic case of a field that inherits `required: true` from the preset but
> should only be required in certain states.

### 7.5 Relation (`type: 'relation'`)

```typescript
{
  name: 'customerId',
  label: 'Customer',
  type: 'relation',
  required: true,
  relation: {
    targetTable: '@@PRESET_TABLE_KEY::customers',
    allowMultiple: false,
  },
}
```

| `relation` field | Description |
|---|---|
| `targetTable` | ✅ Target table. Use the `@@PRESET_TABLE_KEY::<key>` marker (see §8). |
| `allowMultiple` | ➖ If `true`, becomes an N:N relation (the field holds an array of IDs). Default: `false`. |

> **Relation display:** the text shown for an FK comes from the **target table's** `defaultDisplayField`
> (see §9), not from a field declared in the relation. E.g. when showing the `customerId` FK, the system
> reads the `customers` table's `defaultDisplayField` (which is `'name'`) and displays the name.

---

## 8. The `@@PRESET_TABLE_KEY::` marker

Relations declare the target table by **preset key**, not by ID (which only exists after installation):

```typescript
relation: { targetTable: '@@PRESET_TABLE_KEY::customers' }
```

At installation, `resolvePresetRelations` (in the service) replaces `@@PRESET_TABLE_KEY::customers` with
the real ID of the `customers` table created in that specific installation. The key (`customers`) must
match the key used in the system's `tables` object (§5).

---

## 9. SCHEMA metadata (`ITableSchema`)

Beyond `fields`, the schema carries metadata that applies to the whole table.

```typescript
schema: {
  defaultDisplayField: 'name',
  fields: [ /* ... */ ],
  deleteConstraints: [ /* ... */ ],
  compositeUnique: [ /* ... */ ],
  immutableAfter: [ /* ... */ ],
  compare: [ /* ... */ ],      // cross-field comparison (endDate > startDate)
  lifecycle: [ /* ... */ ],    // status state machine
  noOverlap: [ /* ... */ ],    // anti-overlap of periods (schedule)
  ui: { presentation: 'standalone' }, // presentation hint for the frontend
}
```

### 9.1 `defaultDisplayField`

The `name` of the field used to represent a record when it is referenced by another table (FK). E.g.
`customers` has `defaultDisplayField: 'name'`, so every FK to customers shows the customer name instead
of the ID.

### 9.2 `deleteConstraints` — deletion rules

Control what happens when deleting (soft delete) a record referenced by other tables. Evaluated in
`deleteTableData`.

```typescript
deleteConstraints: [
  {
    type: 'RESTRICT_IF_AGGREGATE',
    targetTable: '@@PRESET_TABLE_KEY::productUnits',
    aggregate: { field: 'stock', operator: 'gt', value: 0 },
    errorMessage: 'Cannot deactivate: you still have physical stock.'
  },
  {
    type: 'CASCADE',
    targetTable: '@@PRESET_TABLE_KEY::productUnits',
    cascadeCondition: 'ALWAYS'
  },
  {
    type: 'RESTRICT',
    targetTable: '@@PRESET_TABLE_KEY::saleItems',
    errorMessage: 'Product is linked to active sales.'
  },
  {
    type: 'IGNORE',
    targetTable: '@@PRESET_TABLE_KEY::stockMovements'
  }
]
```

| `type` | Behavior |
|---|---|
| `RESTRICT` | Blocks the deletion if **any** record of the target table references this one. |
| `RESTRICT_IF_AGGREGATE` | Blocks only if the sum of a field (`aggregate.field`) of the referencers meets the condition (`operator` + `value`). E.g. blocks if sum of `stock` > 0. |
| `CASCADE` | Soft-deletes the referencing records too (recursively, respecting their own constraints). |
| `IGNORE` | Neither blocks nor cascades. Leaves the referencers intact (e.g. audit logs). |

**Default behavior:** if a table references this record and **there is no declared constraint** for it,
the system applies `RESTRICT` by default. This protects against accidental deletions without having to
declare everything.

`aggregate.operator`: `gt` | `lt` | `eq` | `neq`.

### 9.3 `compositeUnique` — composite uniqueness

Ensures a **combination** of fields is unique. Field-level `unique` covers a single field; this covers N
fields together.

```typescript
compositeUnique: [
  {
    fields: ['productId', 'unitId'],
    errorMessage: 'A stock record for this product already exists in the selected unit.',
  },
]
```

Checked on create and update (`validateAdvancedRules`). Real example: `productUnits` cannot have two
records for the same `(productId, unitId)` — that would duplicate the stock balance.

### 9.4 `immutableAfter` — state immutability

Blocks editing of fields (or the whole record) once a condition is met. It is the "deleteConstraints of
update". Evaluated in `updateTableData` (Guard 2).

```typescript
immutableAfter: [
  {
    condition: { field: 'paymentStatus', op: 'eq', value: 'Paid' },
    scope: ['totalAmount', 'subtotal', 'discountAmount', 'taxAmount', 'customerId', 'unitId'],
    errorMessage: 'Paid sales cannot have financial or customer fields modified.'
  },
  {
    condition: { field: 'status', op: 'in', value: ['Finalized', 'Cancelled', 'Returned'] },
    scope: 'all',
    errorMessage: 'Finalized, cancelled or returned sales cannot be edited.'
  }
]
```

| Field | Description |
|---|---|
| `condition.field` | The field whose value triggers immutability. |
| `condition.op` | `eq` (equal to a value) or `in` (is in a list). |
| `condition.value` | A single value (`'Paid'`) or a list (`['Finalized', 'Cancelled']`). |
| `scope` | `'all'` = blocks any change to the record. `string[]` = blocks only those fields. |
| `errorMessage` | Message returned when the rule triggers. |

**Why it matters:** without it, a paid sale could have its `totalAmount` changed, corrupting financial
reports. With it, the only way to "fix" a paid sale is to cancel and redo it — accounting integrity
guaranteed.

> System processes (`isSystem: true`) and plugins bypass `readOnly` and `immutableAfter` — they need to
> update protected fields (e.g. `SalesPlugin` adjusts `stock`/`reserved`).

### 9.5 `compare` — cross-field comparison

Compares two fields of the **same record** (e.g. end date > start date, spent ≤ budget). Evaluated on
create and update (`validateAdvancedRules`). If **either** field is missing, the rule is **skipped**
(presence is the job of `required`/`requiredIf`).

```typescript
compare: [
  { left: 'endAt', op: 'gt',  right: 'startAt', errorMessage: 'End must be after the start.' },
  { left: 'spent', op: 'lte', right: 'budget',  errorMessage: 'Spent cannot exceed the budget.' },
]
```

| Field | Description |
|---|---|
| `left` | Name of the left field. |
| `op` | `gt` \| `gte` \| `lt` \| `lte` \| `eq` \| `neq`. Applied as `left op right`. |
| `right` | Name of the right field. |
| `errorMessage` | Message when the comparison fails. |

The comparison typing follows the fields' `type`: `date`/`datetime` compare as a timestamp, `number` as
a number, the rest as a string.

### 9.6 `lifecycle` — status state machine

Restricts the transitions of a state field (e.g. `status`). Evaluated **only on update** (on create the
initial state is validated by the field's `options`) and **only for the user** (`isSystem` bypasses
it). States **missing** from the `transitions` map are **terminal** (cannot change). A write without a
state change is always OK.

```typescript
lifecycle: [
  {
    field: 'status',
    transitions: {
      Pending: ['Paid', 'Cancelled'],
      // Paid and Cancelled absent ⇒ terminal
    },
    errorMessage: 'Invalid status transition.',
  },
]
```

| Field | Description |
|---|---|
| `field` | The field that holds the state. |
| `transitions` | `{ fromState: [allowedTargetStates] }`. |
| `errorMessage` | Message when the transition is forbidden. |

**Combines with `immutableAfter`:** `lifecycle` controls _where_ the status can go; `immutableAfter`
(scope `'all'`) freezes the whole record once it is in a terminal state (e.g. `Paid`). Together they form
the complete lifecycle.

> **Side-effects stay in a plugin.** `lifecycle` only **validates** the transition. Side-effects of the
> change (e.g. stamping `paidAt` when entering `Paid`) remain in lean plugins (e.g.
> `CommissionsPlugin.autoStampPaidAt`).

### 9.7 `noOverlap` — anti-overlap of periods

Rejects records whose `[startField, endField]` interval overlaps that of another existing record sharing
the same scope. Evaluated on create and update; `isSystem` bypasses it. Uses a SQL query
(`countOverlaps`), **not** a full scan.

```typescript
noOverlap: [
  {
    startField: 'startAt',
    endField: 'endAt',
    scopeFields: ['unitId', 'responsibleEmployeeId'],
    errorMessage: 'Schedule conflict: there is already another appointment in this period.',
  },
]
```

| Field | Description |
|---|---|
| `startField` / `endField` | The interval's start/end fields (date/datetime). |
| `scopeFields` | A conflict only applies within the same scope (e.g. same unit **and** same professional). A scope field **missing/empty** in the record is ignored. |
| `errorMessage` | Message when there is a conflict. |

**Half-open** overlap test: `existing.start < new.end AND existing.end > new.start`. So adjacent
intervals (11:00-12:00 after 10:00-11:00) do **not** conflict. The comparison uses `datetime()` in SQL to
normalize timezones/ISO formats.

### 9.8 `ui.presentation` — presentation hint

Signals to the frontend (and the view router) how the table should be presented. Read by the helper
`isNavigable(table)`.

```typescript
ui: { presentation: 'embedded' }
```

| Value | Meaning |
|---|---|
| `'standalone'` | **Default.** A navigable table; appears in the category views. |
| `'embedded'` | A child/detail of another table (e.g. `saleItems`); does not appear on its own. |
| `'system'` | Internal infrastructure (e.g. `analyticsDefinitions`); never editable by the user — `canManageData` blocks writes. |

---

## 10. Where each metadata executes (backend)

| Metadata | Where it runs | Operation |
|---|---|---|
| `required`, `format`, `validation` | `validateDataAgainstSchema` (`buildZodSchema`) | create, update |
| `unique` | `validateAdvancedRules` | create, update |
| `relation` (target existence) | `validateAdvancedRules` | create, update |
| `compositeUnique` | `validateAdvancedRules` | create, update |
| `requiredIf` | `validateAdvancedRules` | create, update |
| `compare` | `validateAdvancedRules` | create, update |
| `noOverlap` | `enforceNoOverlap` (`countOverlaps`) | create, update¹ |
| `lifecycle` | `updateTableData` (Guard 3) | update¹ |
| `readOnly` | `updateTableData` (Guard 1) | update¹ |
| `immutableAfter` | `updateTableData` (Guard 2) | update¹ |
| `deleteConstraints` | `deleteTableData` | delete |
| `meta` (capabilities) | `installPresetAsSystem` | installation |
| `searchable` | **frontend** (`getSearchableFields`) | text search |
| `ui.presentation` | view router (`isNavigable`) + `canManageData` | navigation/write |
| `hidden`, `readOnly` (UI) | **frontend** (`DynamicForm`) | form rendering |

> ¹ **System bypass:** `readOnly`, `immutableAfter`, `lifecycle` and `noOverlap` are skipped for system
> writes (`isSystem: true`) — plugins need to adjust protected fields and the system creates records
> without going through the guards.

> Beyond these, there are **rule plugins** (`rules/plugins/`) that handle **only** non-declarative domain
> logic: cross-table side-effects (e.g. `SalesPlugin` reserves stock and materializes commissions),
> computed fields (e.g. `GoalsPlugin` computes `result`) and checks against `now` (e.g.
> `AppointmentsPlugin` prevents completing before the scheduled time). Pure validation is always
> metadata, never a plugin.

---

## 11. Checklist for creating a new module

1. **Reuse field presets.** Import from `../../fields`. Only declare inline what is specific to the table.
2. **`name`, `description`, `category`** at the top. A valid category in `TableCategories.ts`.
3. **`defaultDisplayField`** — choose the field that best represents a record.
4. **`meta`** if the table depends on / provides capabilities.
5. **Relations** with `@@PRESET_TABLE_KEY::<key>`.
6. **Governance where it makes sense:**
   - System-only fields → `readOnly: true`.
   - Conditionally required fields → `requiredIf`.
   - Unique combinations → `compositeUnique`.
   - Comparisons between fields (end > start) → `compare`.
   - States that lock editing → `immutableAfter`.
   - Allowed status transitions → `lifecycle`.
   - Tables with a period/schedule → `noOverlap`.
   - References that block/cascade a delete → `deleteConstraints`.
   - Embedded/system table → `ui.presentation`.
7. **`searchable: false`** already comes from the number/date/relation/bool field presets. For selects,
   decide case by case.
8. **Register it in the system** via `createTableFromModule` in the appropriate preset.
9. **Validate:** `cd server && npx tsc --noEmit` and `npm run build`.

> **Governance golden rule:** if the rule is pure validation (presence, comparison, transition,
> uniqueness, format), it is **metadata** and any user custom table inherits it for free. Only reach for
> a plugin for cross-table side-effects, computed fields or checks against the clock (`now`).

---

## 12. Common mistakes

| Error | Cause |
|---|---|
| Relation does not resolve at installation | The `@@PRESET_TABLE_KEY::` key does not match the key in `tables`. |
| Installation rejected by capability | `requiresCapabilities` with no module providing it. |
| A field "disappears" from the form | `hidden: true` (intentional) or a typo in `name`. |
| Update rejected unexpectedly | Field marked `readOnly` or an `immutableAfter` rule triggering. |
| Search does not find a field | Field with `searchable: false`. |
| Label shows in EN for a PT user | Missing the `database:fields.<name>` entry in the PT `common.json`. |

---

_Last update: aligned with `models/DynamicTable.model.ts` — field governance (`readOnly`, `searchable`,
`requiredIf`) and schema governance (`compositeUnique`, `immutableAfter`, `compare`, `lifecycle`,
`noOverlap`, `ui.presentation`) — and the 3-layer architecture fields → modules → systems._
