# 🛡️ QA Gold Standard: Analytics Testing Guidelines

This document establishes the official senior-level QA testing protocols for any backend engine parsing Key Performance Indicators (KPIs) within the Analytics layer. 

Any new developer adding a KPI Group (e.g., Cost, Profit, Cashflow) **must mathematically prove** their algorithms withstand the logic anomalies documented below. Code shipped without demonstrating immunity to these 5 boundaries will be rejected.

---

## 1. The Calendar Paradox (`setMonth` Leap Bug)

### The Threat
JavaScript's native `Date.setMonth()` calculates subtractions keeping the *day of the month* locked. Navigating back from `March 31` returns `February 31`. The engine automatically resolves this impossible calendar date by rolling over the excess days, landing on `March 2nd/3rd`. 
**Impact:** All temporal data from February gets bypassed and ignored, heavily corrupting annual dashboard history.

### The Gold Standard Mitigation
Always reset the day tensor to `1` prior to subtracting the month on historical looping aggregators.

```typescript
// ✅ TEST EXPECTATION: 
// The test must artificially set referenceDate to "2024-03-31T23:59:59Z".
// Inject a transaction on "2024-02-15". 
// Check if the KPI accumulates the value properly instead of returning 0. 

const d = new Date(now);
d.setDate(1); // Set day to 1 BEFORE setMonth to prevent leap overflows.
d.setMonth(d.getMonth() - i);
```

---

## 2. B2B Timezone Boundaries (Midnight Leap)

### The Threat
Executing `new Date()` grabs the Server Clock (usually AWS at UTC-0). B2B interactions processed in standard Brazil timezone (UTC-3) late into the last day of the month (e.g. 23H00 of October 31st) are calculated by the Server Native Time as 02H00 of November 1st.
**Impact:** The transaction is placed on the November board, causing client-accountant mismatches.

### The Gold Standard Mitigation
Refrain from `new Date()` logic to delineate bounding comparisons. Mandatorily use the injected string timezone header passed into `AnalyticsProcessorContext` invoking TZ-safe utility bounding.

```typescript
// ✅ TEST EXPECTATION: 
// Mock a transaction on "2024-04-01T01:00:00Z" (April, UTC).
// Call the processor utilizing timeZone: 'America/Sao_Paulo' bounding reference "March 31st 22:30".
// Assert it resolves accurately to the March payload.

const currentWindowStartDate = getStartDateForMonthsWindow(now, 12, timeZone);
```

---

## 3. Graceful Empty States (Division by Zero Shield)

### The Threat
New tenants and onboarded clients entering the ERP dashboard load analytical queries against empty tabular dimensions, meaning array lengths collapse to zero (`totalMonths = 0`). Processors might throw `Infinity` or `NaN` when executing simple operations like averages (`Revenue / totalMonths`).
**Impact:** Client-side React components rendering fatal crashes when mapping `ChartDataPoint` integers containing `NaN`.

### The Gold Standard Mitigation
Force array parsing evaluations returning `0` mathematically when encountering array flaws or invalid strings. Validate variables sequentially using strict TypeScript logic.

```typescript
// ✅ TEST EXPECTATION: 
// Send an empty mock: `rows: []`.
// Run a programmatic array loop parsing all 17+ KPIs delivered recursively looking for NaNs.
for (const r of results) {
    expect(Number.isNaN(r.value)).toBe(false);
    expect(Number.isFinite(r.value)).toBe(true);
}
```

---

## 4. Analytical Temporal Windows (`series` vs `prevSeries`)

### The Threat
A Comparative Directional Trend (Arrow up/down for "Revenue Growth %") requires comparing last month's growth versus two months ago. Programmers incorrectly query the "Previous Annual History Data Array" (`prevSeries`) comparing 13 months ago versus 14 months ago entirely disconnecting the user from recent activity.

### The Gold Standard Mitigation
KPI trend analysis must map indices carefully to the active trailing window (`series`).
**Mês Atual (Value):** `series[length - 1]` vs `series[length - 2]`
**Mês Posterior (PreviousValue):** `series[length - 2]` vs `series[length - 3]`

---

## 5. Exclusory Negative Logic (Chargebacks Docs)

### The Threat
Developers manually trying to incorporate refunds inside the primary KPI script parsing logic, breaking the single-responsibility principles natively assumed by the Aggregator. ERP logic heavily dictates how clients push negatives to tables. 

### The Gold Standard Mitigation
Unless parameterized intentionally, negative numbers (`Total Amount < 0`) should be aggressively dropped natively. All Processor headers **MUST feature formal JSDoc blocks** acknowledging excluding negatives default behaviors ensuring no implicit mathematical assumptions occur in production arrays. 

```typescript
// ✅ TEST EXPECTATION: 
// Inject transactions: `{ amount: 1000 }` and `{ amount: -500 }`.
// Assert Gross Amount accurately bypasses it, returning strictly `1000`. 
```
