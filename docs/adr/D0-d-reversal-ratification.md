# D0 — Human Ratification · Phase D-reversal (Incremento D)

- **Status:** RETROACTIVELY_RATIFIED
- **Ratified by:** web3br1 · **Ratification date:** 2026-06-26
- **Scope:** D-reversal only. Independent of D0-d-settlement.
- **Governs:** ADR-D01 §"Decision — D-reversal". Satisfies gate **G0** for the D-reversal phase.

> **Process note.** The implementation existed before this record was persisted. These decisions
> reflect human ratifications made during the discovery session and were written to disk afterward
> to close the governance gap found by review. This document does not claim the ideal order
> (ADR/D0 → implementation → review) was followed; the real order was implementation → ratification
> persisted afterward → re-review. It records the ratified decisions now used to audit the code.

This document records the decisions a human ratified for the cancellation/return reversal of
salon sales. Code that embeds these decisions (mappers, bridges, fixture, SalesModule) cites them
by reference (D2-Q4, D2-Q5, D2-Q5a, D2-Q5b, D2-Q10).

| Ref | Question | Ratified answer | Engineering consequence |
|---|---|---|---|
| D2-Q4 | On cancel/return, reverse what? | **Adaptive**: revenue always; settlement only if it exists | Bridge checks `findEntryBySource('salon.sale.settled', saleId)`; reverses it if present. Branch dormant until D-settlement ships. |
| D2-Q5 | Cancelled vs Returned semantics | **Distinct accounting effects** | Two mechanical paths (below). |
| D2-Q5a | Returned mechanism | **Dedicated contra-revenue `3.2 Devoluções de Vendas`** | Cancelled = `reverseEntry` of original. Returned = *new* entry `D 3.2 / C 1.1.2`, `sourceType='salon.sale.returned'`. Preserves gross revenue (3.1 untouched). |
| D2-Q5b | Does return move stock? | **No — stock OUT of D** | No inventory/COGS effect. Opens **Incremento E** (no forward inventory posting exists to reverse). |
| D2-Q10 | Audit fields | **On `SalesModule` (JSON), zero migration** | `cancelledAt`/`returnedAt`/`reason`/`actor` as preset fields; `JournalEntry` keeps `createdById`/`postedById`. |

## Ratified mechanics

**Cancelled** → `reverseEntry` of `salon.sale.finalized` (`D 1.1.2 / C 3.1` mirrored). If
`salon.sale.settled` exists, also `reverseEntry` it (D2-Q4 adaptive). Double-reversal barred by the
engine (`reversedById` + `findBySource('reversal', id)` + P2002).

**Returned** → new `postEntry`: `D 3.2 Devoluções de Vendas / C 1.1.2 A Receber`, gross cents,
`sourceType='salon.sale.returned'`, `sourceId=saleId`. Idempotent on its own `@@unique` axis; does
not collide with `salon.sale.finalized`.

## Derived scoping decision (forced by absence of D-settlement; reversible on objection)

In D-reversal, Returned **always credits `1.1.2` A Receber**. The "already-settled refund → credit
cash" variant is deferred to D-settlement's arc, where the cash account is known.

## Chart-of-accounts extension (ratified)

```
{ code:'3.2', name:'Devoluções de Vendas', nature:'Revenue', acceptsEntries:true }  // contra-revenue, debit-normal
```
Implementer must verify `AccountingReportService` nets 3.2 as credit−debit per revenue account
(so a debit balance reduces net revenue).

## State-transition rule

`Finalized → Cancelled/Returned` is impossible on the generic `updateTableData`
(`immutableAfter scope:'all'`). The only sanctioned path is `SalesCancellationService`
(`backend-workflow-transition-generator`) flipping `status` via `isSystem:true`. The global
`immutableAfter` is **not** loosened.
