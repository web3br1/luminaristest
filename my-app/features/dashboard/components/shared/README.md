# `components/shared/` — Schema-Aware Building Blocks

This folder contains components and utilities that are **schema-aware** — they
accept `IDynamicTable`, `ITableSchema`, and `IDynamicTableData` props and know
how to render generic ERP records.  They are the layer between raw API data
and the higher-level category-views.

## Contents

| File | Purpose |
|------|---------|
| `dynamic-tables.client.ts` | **Canonical type definitions** — `IDynamicTable`, `IDynamicTableData`, `ITableSchema`, `ISchemaField`, `isTableSchema()`. Every component in the dashboard imports types from here. |
| `relation-utils.client.ts` | Client-side helpers for fetching and formatting related-table records (`fetchRelatedTableData`, `formatRelatedDisplayValue`). Used by `RelationSelector` and directly by sidebar components. |
| `GenericDataSidebar.tsx` | Read-only slide-over panel for inspecting a single `IDynamicTableData` record. Resolves FK relations via `useTableRelationLookups`. |
| `EditRecordButton.tsx` | FAB-style button that opens a `DynamicForm` in a modal for editing an existing record. |
| `FloatingActionButton.tsx` | FAB-style button that opens a `DynamicForm` in a modal for creating a new record. |

## Design Constraints

- **No HTTP inside components** — all data fetching is done in category-view
  data hooks (`useXData`). Components receive typed records + schemas as props.
- **`useTableRelationLookups` is the only FK resolver** — never instantiate
  custom `useEffect` + `fetch` combos for relations inside components.
- **`isTableSchema()` type guard** — always use this before accessing
  `schema.fields` when the source is `unknown` or a loosely typed API response.

## Canonical Types Quick Reference

```typescript
// A row returned from any dynamic table
interface IDynamicTableData {
  id: string;
  data: Record<string, unknown>;
}

// The full table descriptor including its schema
interface IDynamicTable {
  id: string;
  name: string;
  key?: string;
  internalName?: string | null;
  category?: string;
  schema: ITableSchema | null;
}

// Schema of a table
interface ITableSchema {
  defaultDisplayField?: string;
  fields: ISchemaField[];
}

// A single field descriptor
interface ISchemaField {
  name: string;
  type: string;       // 'string' | 'number' | 'date' | 'datetime' | 'boolean' | 'relation' | 'json' | 'textarea' | 'select' | 'enum' | ...
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  options?: Array<string | { label: string; value: string }>;
  numberFormat?: 'currency' | 'percentage' | 'integer' | 'decimal';
  relation?: { targetTable?: string; allowMultiple?: boolean };
}

// Type guard — always use before accessing schema.fields when source is `unknown`
function isTableSchema(value: unknown): value is ITableSchema;

// React hook — handles fetch, refetch and error state for a single table.
function useTableData(tableId: string): {
  table: IDynamicTable | null;
  records: IDynamicTableData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};
```

## Audit Status

✅ **Gold Standard (2026-05-27).** Zero `as any` no código fonte. Todos os `t()` com fallbacks EN. Todos os handlers em `useCallback`. Type guards aplicados antes de acessar campos opcionais.
