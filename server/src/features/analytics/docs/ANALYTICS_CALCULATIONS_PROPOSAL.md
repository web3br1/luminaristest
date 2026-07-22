# Proposal: Support for Complex Analytics Calculations

## Current Situation

### ✅ What works correctly:
- Dynamic and generic processors
- Simple aggregations (sum, count)
- Status and period grouping validations
- Schema-aware configurations and template frameworks

### ❌ Limitations blocking complex math operations:

1. **Strictly Single-Table bounded**
   - KPI engines receive bounded context chunks strictly tied to one table mapping.
   - Calculations cross-referencing dimensions: `Sales - Expenses = Net Profit` cannot occur.

2. **No native formulas support**
   - No structured parsing evaluating: `revenue - costs = gross profit`.
   - Cannot assign table parameters to algebraic variables natively.

3. **Additive aggregations only**
   - Lacks embedded division, percentage or cross-multiplication operators.
   - Native derived calculations missing (ROI, margins, etc.)

4. **Missing specialized financial pipelines**
   - Gross profit, Net Profit margins.
   - ROI arrays, Break-Even analysis missing from dynamic generators.

---

## Technical Solution Proposal

### 1. Extend the Processor Context

```typescript
export type AnalyticsProcessorContext = {
  // Primary fallback Table (Ensures legacy compatibility)
  table: IDynamicTable;
  schema: ITableSchema;
  rows: TableDataRow[];
  
  // NEW: Multi-table context container
  tables?: Map<string, {
    table: IDynamicTable;
    schema: ITableSchema;
    rows: TableDataRow[];
  }>;
  
  params: Record<string, any>;
  
  // NEW: Helper algebraic evaluator closure
  calculate?: (expression: string, row: TableDataRow, context: any) => number;
};
```

### 2. Formula Calculation Processor

**FormulaCalculationProcessor**

Enables defining algebraic mathematical formulas leveraging mapped names dynamically.

**Usage Example:**
```typescript
{
  templateKey: 'formulaCalculation',
  key: 'sales.grossProfit',
  title: 'Gross Profit',
  type: 'bar',
  tableKey: '@@PRESET_TABLE_KEY::sales',
  fieldMapping: {
    revenueField: 'totalAmount',
    costField: 'totalCost',
  },
  params: {
    formula: 'revenue - cost',  // Formula parsing mathematical definitions natively
    groupBy: 'month',           // Bounding options
    dateField: 'date',
  },
}
```

**Supported Formula Capabilities:**
- Operations: `+`, `-`, `*`, `/`, `%`
- Variables: mapped field strings natively translated.
- Functions: `sum()`, `avg()`, `min()`, `max()`, `count()`

### 3. Specialized Financial Processor

**FinancialMetricsProcessor**

Specific highly-optimized processor bound to execute intensive financial formulas mathematically fast.

**Usage Example:**
```typescript
{
  templateKey: 'financialMetrics',
  key: 'finance.profitAnalysis',
  title: 'Profit Board',
  type: 'bar',
  tableKey: '@@PRESET_TABLE_KEY::sales',
  fieldMapping: {
    revenueField: 'totalAmount',
    costField: 'totalCost',
  },
  params: {
    metrics: ['grossProfit', 'netProfit', 'profitMargin'],
    // grossProfit = revenue - cost
    // netProfit = revenue - cost - expenses (if expenses table is pushed)
    // profitMargin = (grossProfit / revenue) * 100
  },
}
```

### 4. Multi-Table Calculation Engine

**MultiTableCalculationProcessor**

Evaluates heavy array aggregations performing cross-referencing between distinct tables (Sales vs Refunds vs Costs).

**Usage Example:**
```typescript
{
  templateKey: 'multiTableCalculation',
  key: 'finance.netProfit',
  title: 'Net Profit',
  type: 'bar',
  tableKey: '@@PRESET_TABLE_KEY::sales',
  params: {
    tables: {
      sales: '@@PRESET_TABLE_KEY::sales',
      expenses: '@@PRESET_TABLE_KEY::expenses',
    },
    formula: 'sales.totalAmount - expenses.totalAmount',
    groupBy: 'month',
    dateField: 'date',
  },
}
```

---

## Proposed Implementation Horizon

### Phase 1: Single Table Analytics
1. Create `FormulaCalculationProcessor` utilizing streaming `for await` contexts.
2. Embed `ExpressionEvaluator` module preventing JS evaluation exploits (`eval()` limits).
3. Accommodate basic array structures.

### Phase 2: Core Financial Architecture
1. Publish `FinancialMetricsProcessor` inside the backend root.
2. Structure legacy logic metrics supporting ROI / Break-even outputs properly.

### Phase 3: Multi-Data Pipelines
1. Enhance `AnalyticsResolver` parsing configuration arrays dynamically into Maps context arrays.
2. Produce `MultiTableCalculationProcessor`.
3. Assure SQL or In-Memory JOINs execute memory-safely without degrading the backend speed.
