# Inventory View

Stock management view with product-level expand/collapse rows, inline price editing, movement history, and append-only audit log.

---

## Architecture

Follows the Gold Standard 4-layer pattern identical to Products/Services/People/Finance.

```
InventoryView (shell)
  └── InternalInventoryView (orchestrator)
        ├── useInventoryData      ← HTTP only (data hook)
        ├── useInventoryLogic     ← pure logic / state
        ├── InventoryFilterBar    ← filter controls
        ├── CategoryHeader        ← shared header + portal
        ├── CategoryTabs          ← stock | movements
        ├── StockTab              ← product table + pagination
        │     └── InventoryTable  ← expand/collapse rows, inline price edit
        ├── MovementsTab          ← movement history + pagination
        │     └── InventoryHistoryTable ← resizable column grid
        ├── MovementModal         ← new movement entry
        └── GenericDataSidebar    ← record detail panel
```

---

## Data Hook — `useInventoryData`

**File:** `hooks/useInventoryData.tsx`

Single source of truth for all HTTP. All mutations are `useCallback`-wrapped following the Gold Standard pattern established in `useProductsData`.

### Table Detection

| Variable | Criteria |
|---|---|
| `movementsTable` | `category === 'inventory'` + name includes `movemen` |
| `productsTable` | `category === 'products'` or name `=== 'products'` |
| `unitsTable` | name `=== 'units'` |
| `productUnitsTable` (inventory) | `category === 'inventory'` + name includes `unit` or `=== 'product units'` |
| `suppliersTable` | name includes `supplier` / `fornec` or `category === 'people'` + name `=== 'suppliers'` |

### Relation Lookups

Two independent `useTableRelationLookups` calls:

```typescript
// Movements: excludes productId/unitId (handled as structural columns)
const { relationLookups: movementsRelationLookups } =
    useTableRelationLookups(movementsTable, tables, ['productId', 'unitId']);

// Inventory: all relation fields resolved
const { relationLookups: inventoryRelationLookups } =
    useTableRelationLookups(productUnitsTable, tables);
```

### Inventory Lookup Map

```typescript
// inventoryLookup: productId → unitId → IDynamicTableData
// Used by InventoryTable for O(1) access to stock/price per product×unit pair
const inventoryLookup: Record<string, Record<string, IDynamicTableData>>
```

### Mutations

```typescript
// Save inline price — updates salePrice on a product-unit record
saveInlinePrice: (invRecordId: string, newPrice: number) => Promise<void>

// Create movement — appends to audit log, refetches both inventory + movements
createMovement: (body: Record<string, unknown>) => Promise<void>
```

Both follow the canonical Gold Standard pattern:
```typescript
const saveInlinePrice = useCallback(async (invRecordId, newPrice) => {
    if (!productUnitsTable?.id) throw new Error('Inventory table not found');
    await DynamicTableService.updateRecord(productUnitsTable.id, invRecordId, { data: { salePrice: newPrice } });
    refetchInventory();
}, [productUnitsTable?.id, refetchInventory]);
```

### Return shape

```typescript
{
    // Tables
    movementsTable, productsTable, inventoryTable, suppliersTable,
    movementsTableId, productsTableId, inventoryTableId, suppliersTableId,
    // Data
    products, inventoryRecords, units, movements,
    // Lookups
    inventoryLookup, productNameMap, unitNameMap,
    movementsRelationLookups, inventoryRelationLookups,
    // Status
    isLoading,
    // Actions
    refetchInventory, refetchMovements, saveInlinePrice, createMovement,
}
```

---

## Logic Hook — `useInventoryLogic`

**File:** `hooks/useInventoryLogic.tsx`

Pure state + computed logic. Zero HTTP — delegates price save via the `onSaveInlinePrice` prop.

### Props

```typescript
interface UseInventoryLogicProps {
    products: IDynamicTableData[];
    inventoryLookup: Record<string, Record<string, IDynamicTableData>>;
    units: IDynamicTableData[];
    movements: IDynamicTableData[];
    onSaveInlinePrice: (invRecordId: string, newPrice: number) => Promise<void>;
}
```

### Pagination

- `ITEMS_PER_PAGE = 25` — module-level constant, stable across renders
- Separate page state for stock (`stockPage`) and movements (`movementsPage`)
- Filter handlers reset their respective page inline (no `useEffect` watcher):
  ```typescript
  const handleQueryChange = useCallback((v) => { setQuery(v); setStockPage(1); }, []);
  ```

### Inline Price Flow

```
User edits price input (InventoryTable)
  → setEditingPriceId / setEditingPriceValue (local state in logic hook)
  → Enter key or ✓ button → onSavePrice(id, parsedValue)
  → handleSaveInlinePrice (logic hook — manages isSavingPrice, error notify)
  → onSaveInlinePrice prop → saveInlinePrice (data hook — HTTP)
  → refetchInventory() → UI updates
```

### Stats

Computed from `inventoryLookup`:
```typescript
{ totalSkus, totalItems, criticalItems, totalValue }
```
- `criticalItems` = entries where `(stock - reserved) <= 5`
- `totalValue` = Σ(`stock × salePrice`) across all product-unit pairs

---

## Components

### `InventoryTable`

**File:** `components/InventoryTable.tsx`

Two-level expand/collapse grid: product row (collapsed = aggregate) → unit rows (expanded = per-location detail).

**Structural columns:** `productId`, `unitId`, `stock`, `reserved`, `salePrice`  
Schema fields not in `STRUCTURAL` and not `hidden` render as resizable dynamic columns via `inventoryRelationLookups` + `useRenderTypedValue`.

**Key props:**
| Prop | Type | Purpose |
|---|---|---|
| `inventoryLookup` | `Record<string, Record<string, IDynamicTableData>>` | O(1) stock/price lookup |
| `inventoryRelationLookups` | `Record<string, Map<string, string>>` | FK label resolution for dynamic columns |
| `inventoryTable` | `IDynamicTable \| null` | Schema source for extra columns |
| `onOpenMovementModal` | callback | Opens movement entry modal for product×unit |
| `onSavePrice` | `(id, price) => void` | Routes to `handleSaveInlinePrice` in logic hook |

**Column config key:** `'lum-inventory-grid-config'` (persisted in localStorage)

---

### `InventoryHistoryTable`

**File:** `components/InventoryHistoryTable.tsx`

Resizable column grid rendering the movement audit log.

**Structural columns:** `productId`, `unitId`, `type`, `quantity`, `date`, `reason`, `cost`, `supplierId`, `paymentStatus`, `detailKey`

**Fixed columns (always rendered via switch):**

| ID | Content |
|---|---|
| `date` | Formatted with locale-aware `toLocaleString` |
| `type` | Badge: green Entrada / red Saída |
| `product` | Product name (bold) + unit name (icon + small text) |
| `quantity` | Signed `+qty` / `-qty` |
| `cost` | `formatCurrency(cost)` if `cost > 0` |
| `supplier` | `<RelationCell value={d.supplierId} lookup={movementsRelationLookups['supplierId']} />` |
| `reason` | Translated reason badge + optional paymentStatus |

Schema fields not in `STRUCTURAL` render after the fixed columns — relations via `RelationCell`, others via `useRenderTypedValue`.

**CustomizeColumnsPanel** is portaled into `#inventory-table-actions-portal`.

**Column config key:** `'lum-movements-grid-config'`

---

### `MovementModal`

**File:** `components/MovementModal.tsx`

Portals into `document.body`. Accepts `onCreateMovement` callback — no HTTP inside.

**Movement types:** `'In'` | `'Out'`  
**Movement reasons:** `'Purchase'` | `'Sale'` | `'Internal Use'` | `'Return'` | `'Adjustment'`

**Conditional fields (visible only when `type === 'In'`):**
- `cost` — formatted currency input (locale-aware)
- `supplierId` — `<RelationSelector targetTable={suppliersTableId} />`

**Validation:**
- `quantity > 0` always required
- Purchase (`In` + reason `Purchase`) requires both `supplierId` and `cost > 0`

**Body sent to `onCreateMovement`:**
```typescript
{
    productId, unitId, type, quantity,
    date: new Date().toISOString(),
    reason,
    sourceType: 'UI_INVENTORY_MANAGER',
    // conditionally:
    cost,       // if In + cost > 0
    supplierId, // if In + supplier selected
}
```

---

### `InventoryFilterBar`

**File:** `components/InventoryFilterBar.tsx`

Tab-aware: renders different controls depending on `activeTab`.

| Tab | Controls |
|---|---|
| `'stock'` | Search, SortSelect, unit dropdown, low-stock toggle, SKU/items/critical stats |
| `'movements'` | Search, type filter (All/In/Out), incoming/outgoing/total stats |

---

### `StockTab` / `MovementsTab`

Thin layout shells — handle loading/empty states and wrap `InventoryTable` / `InventoryHistoryTable` + `StandardPagination`. No business logic.

---

## Tab IDs

```typescript
'stock'     // product stock grid
'movements' // movement audit log
```

---

## Widget Mode

When `isWidgetMode === true`:
- `CategoryHeader`, `CategoryTabs`, and full pagination are hidden
- `InventoryTable` renders `paginatedProducts.slice(0, 5)` (max 5 rows)
- A "Ver todo o estoque (N) →" link points to `/dashboard?category=inventory`
- `actions` column is hidden via `defaultVisible: !isWidgetMode` in column config

---

## Sidebar

`GenericDataSidebar` opens when either a product row or an inventory (unit-level) row is clicked:

```typescript
onSelectProduct={(p) => setSelectedItem({ record: p, table: productTable })}
onSelectInventory={(i) => setSelectedItem({ record: i, table: inventoryTable })}
```

`onRefresh={refetchInventory}` keeps sidebar data consistent after edits.

---

## Gold Standard Compliance

| Rule | Status |
|---|---|
| HTTP only in data hook | ✅ `saveInlinePrice`, `createMovement` in `useInventoryData` |
| No HTTP in logic hook | ✅ `useInventoryLogic` has zero service calls |
| No HTTP in components | ✅ `MovementModal` delegates via `onCreateMovement` prop |
| `useTableRelationLookups` in data hook | ✅ Two calls — movements + inventory |
| `import type` for type-only imports | ✅ All 8 files |
| `useCallback` on all prop-passed handlers | ✅ All mutations + filter handlers |
| `ITEMS_PER_PAGE` at module level | ✅ In `useInventoryLogic` |
| Filter handlers reset pagination inline | ✅ `handleQueryChange`, `handleUnitFilterChange`, etc. |
| `isWidgetMode` propagated end-to-end | ✅ Shell → Internal → StockTab → InventoryTable |
