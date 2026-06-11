# 📊 Technical Documentation: Analytics and KPIs System

This documentation describes the complete architecture of the KPI (Key Performance Indicators) system within the Analytics module. The objective is to provide a detailed technical guide for developers and system maintainers.

---

## 🏛️ Architecture Overview

The system follows a **"Thin Client"** pattern, where the back-end is responsible for all business logic, calculations, streaming, and data transformations. The front-end acts strictly as a visualization layer.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONT-END                                 │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ AnalyticsDashboard│  │   ChartRenderer   │  │    KpiCard      │  │
│  └─────────┬─────────┘  └─────────┬─────────┘  └────────┬────────┘  │
│            │                      │                     │           │
│            └──────────────────────┼─────────────────────┘           │
│                                   ▼                                 │
│                        useAnalyticsData (Hook)                      │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │ HTTP (REST API)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            BACK-END                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      AnalyticsService                         │  │
│  │  - Orchestrates data fetching                                 │  │
│  │  - Validates configurations (Schema-Aware)                    │  │
│  │  - Assembles preset groups                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                   │                                 │
│           ┌───────────────────────┼───────────────────────┐         │
│           ▼                       ▼                       ▼         │
│  ┌─────────────────┐   ┌───────────────────┐   ┌─────────────────┐  │
│  │ RevenueProcessor│   │ AggregatePipeline │   │  CostProcessor  │  │
│  │   (17 KPIs)     │   │   (Dynamic)       │   │   (14 KPIs)     │  │
│  └─────────────────┘   └───────────────────┘   └─────────────────┘  │
│                                   │                                 │
│                                   ▼                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                       DynamicTableService                     │  │
│  │  - Accesses dynamic tables (Sales, Expenses, etc.)            │  │
│  │  - Streams data chunks safely (for await)                     │  │
│  │  - Resolves relations (customerId -> clientName)              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Directory Structure

```text
server/src/features/analytics/
├── core/                         # Core infrastructure
│   ├── models/                   # TypeScript Interfaces
│   │   └── AnalyticsConfiguration.ts  
│   ├── pipeline/                 # Pipeline Definitions
│   │   ├── Pipeline.ts           
│   │   └── Compiler.ts           
│   └── index.ts                  # Template and processor registry
│
├── dynamic/                      # Generic processors
│   ├── processors/
│   │   ├── AggregatePipelineProcessor.ts  # Universal processor
│   │   └── TemporalAggregationProcessor.ts
│   └── templates/
│       └── AggregatePipelineTemplate.ts
│
├── kpis/                         # Specialized (optimized) processors
│   ├── revenue/                  # 17 Revenue KPIs
│   │   ├── RevenueKpiTemplate.ts
│   │   └── revenueKpiProcessor.ts
│   ├── cost/                     # 14 Cost KPIs
│   │   ├── CostKpiTemplate.ts
│   │   └── costKpiProcessor.ts
│   └── profit/                   # 18+ Profit/Margin KPIs
│       ├── ProfitKpiTemplate.ts
│       └── profitKpiProcessor.ts
│
├── engine/
│   └── FieldMapper.ts            # Maps configurations to parameters
│
├── services/
│   ├── AnalyticsService.ts       # Main orchestration service
│   └── AnalyticsValidator.ts     # Schema validation
│
└── utils/
    └── DateUtils.ts              # Timezone-safe date utilities
```

---

## 🔧 Main Components

### 1. `AnalyticsTemplate` (Metadata Model)

A template defines **WHAT** a KPI requires to execute. It does not calculate anything; it only outlines constraints and dependencies.

```typescript
interface AnalyticsTemplate {
  key: string;                     // e.g., 'revenueKpis'
  name: string;                    // Human-readable name
  description: string;
  processor: string;               // Key of the corresponding processor
  requiredFields: FieldRequirement[]; // Mandatory schema fields
  optionalFields: FieldRequirement[]; // Optional schema fields
  defaultOptions: Record<string, any>;
  defaultParams: Record<string, any>;
}
```

**Example**: The `revenueKpis` template demands an `amountField` (number) and a `dateField` (date).

---

### 2. `AnalyticsConfiguration` (Usage Instance)

A configuration is an **instance** of a template applied bounding a specific table or preset module.

```typescript
interface AnalyticsConfiguration {
  templateKey: string;             // e.g., 'revenueKpis'
  key: string;                     // e.g., 'salesRevenue'
  title: string;                   // e.g., '1. Revenue – Key Metrics'
  type: 'bar' | 'line' | 'donut' | 'pie' | 'area';
  tableKey: string;                // e.g., '@@TABLE_SELF@@' or 'sales'
  fieldMapping: Record<string, string>; // Field maps
  options: Record<string, any>;    // Display configurations
  params: Record<string, any>;     // Internal processor arguments
}
```

**Mapping Example**:
```typescript
fieldMapping: {
  amountField: 'totalAmount',   // The 'totalAmount' table column acts as the financial value
  dateField: 'date',
  statusField: 'saleStatus',
}
```

---

### 3. `AnalyticsProcessor` (Calculation Engine)

A processor receives data chunks and yields a `ChartDataPoint[]`. There are two main concepts:

#### 3.1 Fixed Processors (Optimized)
Calculates dozens of high-value KPIs in a single stream pass. Memory-safe and highly performant relying on integer math algorithms.
- `revenueKpiProcessor`: 17 Revenue KPIs.
- `costKpiProcessor`: 14 Cost KPIs.
- `profitKpiProcessor`: 18+ Profit KPIs.

#### 3.2 Dynamic Processors (Flexible)
Parses declarative specifications (`PipelineSpec`) at runtime to craft no-code queries.
- `aggregatePipelineProcessor`: Runs any pipeline-bound aggregation.
- `temporalAggregationProcessor`: Groups values across time horizons.

**Standard Output Interface**:
```typescript
interface ChartDataPoint {
  name: string;         // Friendly label (e.g., 'New Customer')
  value: number;        // Mathematical value
  previousValue?: number; // Optional comparison baseline
  recordIds?: string[]; // Traces back IDs composing this calculation
  tableSource?: string; // Origin table tracer
}
```

---

## 🔄 Execution Flow

1. **Request**: The front-end hits `/analytics/presets/:presetKey/data?key=revenueKpis`.
2. **Orchestration**: `AnalyticsService` queries the preset configuration metadata.
3. **Validation**: `AnalyticsValidator` ensures mapped fields natively exist within the schema boundaries.
4. **Mapping**: `FieldMapper` transpiles the configs into processor parameters.
5. **Processing**: The adequate processor streams table records safely in memory batches (`for await`).
6. **Resolution**: Outputs map technical dimensions to UI labels (e.g., `true` -> `New Customer`).
7. **Response**: The `ChartDataPoint[]` array pushes the final calculation out to the renderer.

---

## 🛡️ Security & Consistency Engines

### Schema-Aware Validation
The system throws strict backend errors before failing on dashboard renders if fields fall out of table schemas definition:
```text
[Analytics] Configuration errors found in preset 'finance':
  - revenueKpis.amountField: Mapped field 'totalAmount' does not exist in table schema
```

### Automatic Overflow Protection (Temporal Bounding)
Processors internally govern data periods utilizing native `isDateWithinWindow` helpers overriding any timezone discrepancy created by node engines natively parsing local UTCs.

### Safe Number Exclusions (Chargeback Guard)
Processors inherently filter missing data strings effectively applying string parsers via `DataSanitizer` eliminating currency mask corruptions (`R$`). Negative entries are conventionally ignored demanding strict filtering handling upstream or through manual array mapping configurations.

---

## 📝 How to Add a New KPI

### Option A: Via Pipeline (No-Code approach)
1. Add a new `AnalyticsConfiguration` payload inside the respective Preset Module (e.g., `SalesModule.ts`).
2. Assign the `templateKey` as `'aggregatePipeline'`.
3. Construct the JSON `PipelineSpec` within the `params.pipeline` property.

### Option B: Hardcoded Fixed Processor (High Performance)
1. Write a new file within `kpis/` (e.g., `retentionKpiProcessor.ts`).
2. Adhere logic mathematically implementing `AnalyticsProcessor` via asynchronous generator loops.
3. Build the parallel `AnalyticsTemplate` mapping metadata.
4. Export and register them natively within the `core/index.ts` layer.
