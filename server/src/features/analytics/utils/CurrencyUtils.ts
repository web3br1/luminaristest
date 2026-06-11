/**
 * Currency Utilities for Analytics Engine
 * Ensures safe decimal additions avoiding V8 Float Drift.
 */

export function addMoney(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(Number(b || 0) * 100)) / 100;
}
