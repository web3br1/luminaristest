# ADR-D01 — Accounting Settlement & Reversal

- **Status:** RETROACTIVELY_RATIFIED — splits into two independent phases: **D-reversal** and **D-settlement**
- **Ratified by:** web3br1 · **Ratification date:** 2026-06-26
- **Date:** 2026-06-26

> **Process note.** The implementation existed before this ADR/D0 record was persisted. The
> decisions in this document reflect human ratifications made during the discovery session and were
> written to disk afterward to close the governance gap found by review. This document does not
> claim the ideal order was followed; it records the ratified decisions now used to audit the
> implementation. Ideal order: ADR/D0 → implementation → review. Real order: implementation already
> existed → ADR/D0 persisted afterward → re-review.
- **Decision class:** PRISMA_FIRST_CLASS with source DynamicTable
- **Depends on:** ADR-C01 (Salon Sales Accounting Bridge, merged) · AccountingSync B.1 (PR #5)
- **Supersedes:** none · **Related:** ADR-B01 (idempotency), ADR-C01 (revenue recognition)
- **Spawns:** Incremento E (stock/COGS), Incremento F (Acquirer Payout & Card Fees), Deferred (prepaid-package origination)

## Context

Incremento C recognizes **revenue** at the commercial fact (`sale.status === 'Finalized'`),
always `D 1.1.2 A Receber / C 3.1 Receita`, ignoring payment. This leaves two gaps:

- **D-settlement:** the receivable is never cleared to a cash/bank/card account — every sale
  shows an open `A Receber` forever, even if paid on the spot.
- **D-reversal:** a cancelled/returned sale keeps booking non-existent revenue, and — decisively —
  the sale **cannot even change state**, because `SalesModule.immutableAfter` freezes the row
  (`status ∈ {Finalized,Cancelled,Returned} → scope 'all'`) on the generic `updateTableData` path
  ([SalesModule.ts](../../server/src/features/dynamicTables/presets/modules/finance/SalesModule.ts),
  enforced at [DynamicTableService.ts:662](../../server/src/features/dynamicTables/services/DynamicTableService.ts), `if (!isSystem)`).

The posting engine already provides `PostingService.reverseEntry` (mirror + `reversedById` + P2002,
idempotent) and `findEntryBySource` — so reversal needs no new engine, only a sanctioned state
transition and a post-commit bridge.

Boundary (Contract §2.1) is unchanged: `sales` stays DynamicTable; accounting stays first-class
Prisma; all new integration lives in post-commit bridges + dedicated transition services, never in
`DynamicTableService`/`RuleContext`/`RulePlugin`/`features/dynamicTables/**`.

## Decision — D-reversal (ratified, see D0-d-reversal)

| Ref | Decision |
|---|---|
| D2-Q4 | **Adaptive**: reverse `salon.sale.finalized` always; reverse `salon.sale.settled` **only if it exists**. |
| D2-Q5 | **Distinct effects** for Cancelled vs Returned. |
| D2-Q5a | **Cancelled** → `reverseEntry` of the revenue entry. **Returned** → a *new* entry `D 3.2 Devoluções de Vendas / C 1.1.2 A Receber`, `sourceType='salon.sale.returned'` (contra-revenue, preserves gross revenue history). |
| D2-Q5b | **Stock OUT of D** → Incremento E (no inventory account/posting exists to reverse). |
| D2-Q10 | Audit fields `cancelledAt`/`returnedAt`/`reason`/`actor` on `SalesModule` (JSON, **zero migration**); `JournalEntry` keeps only `createdById`/`postedById`. |

New canonical account: `{ code:'3.2', name:'Devoluções de Vendas', nature:'Revenue', acceptsEntries:true }`
(contra-revenue, debit-normal; `AccountingReportService` must net it as credit−debit per revenue account).

State transition: a dedicated `SalesCancellationService` (pattern `backend-workflow-transition-generator`,
mirrors `CrmPipelineService.advanceStage`) flips `status` via `updateTableData` with `isSystem:true`.
The generic `immutableAfter` stays intact; only the service has the restricted bypass.

## Decision — D-settlement (ratified, see D0-d-settlement)

| Ref | Decision |
|---|---|
| D1-Q1 | Conceptual trigger `Finalized && Paid`; **mechanism** via `RegisterPayment` (D1-Q11), not generic update. |
| D1-Q5 | **Gross**; card debits an intermediate `A Receber Cartão/Adquirente`, **not** Banco. |
| D1-Q6 | Card/acquirer **fee OUT** → Incremento F (`salon.card.payout.settled`). |
| D1-Q10 | Package Balance → `D 2.1.1 Pacotes Pré-pagos (Liability) / C 1.1.2`; **never cash**; missing account → block, no fallback. |
| D1-Q2 | Settlement accounting date = new `paidAt` field. |
| D1-Q11 | **`RegisterPayment`/`SettleSale`** systemic transition with literal field whitelist; generic update NOT approved; global `immutableAfter` bypass NOT approved; restricted systemic bypass approved. |

**D1-QMAP (ratified) — `paymentMethod → settlement debit`** (credit always `1.1.2`, gross cents):

| paymentMethod | Debit | Code |
|---|---|---|
| Cash | Caixa | `1.1.3` |
| Pix | Banco | `1.1.1` |
| Debit Card | A Receber Cartão/Adquirente | `1.1.4` |
| Credit Card | A Receber Cartão/Adquirente | `1.1.4` |
| Package Balance | Pacotes Pré-pagos | `2.1.1` |

New canonical accounts:
```
{ code:'1.1.4', name:'A Receber Cartão / Adquirente', nature:'Asset',     acceptsEntries:true  }
{ code:'2',     name:'Passivo',                        nature:'Liability', acceptsEntries:false }
{ code:'2.1.1', name:'Pacotes Pré-pagos',              nature:'Liability', acceptsEntries:true  }
```

`RegisterPayment` whitelist (editable): `paymentStatus='Paid'`, `paymentMethod`, `paidAt`,
`paidByUserId`, `paymentReference` (opt. `settlementRequestedAt`, `settlementSource`). Frozen
(never touched here): `status`, `unitId`, `customerId`, `totalAmount`, `subtotal`,
`discountAmount`, `taxAmount`, `saleItems`, `date`.

**Ordering invariant:** settlement is blocked (`blocked_missing_revenue_entry`) until the
`salon.sale.finalized` entry exists — never clear a receivable that does not exist.

`sourceType='salon.sale.settled'`, `sourceId=saleId` — distinct idempotency axis from revenue, so
both coexist on the same sale under `@@unique([userId,unitId,sourceType,sourceId])`.

## Out of scope (Incremento D)

Card/acquirer fees, bank payout, real settlement date of the acquirer → **Incremento F**.
Stock/COGS movement on returns → **Incremento E**. Prepaid-package origination
(`D cash / C 2.1.1`) → **Deferred**. Fiscal/NF-e, commission, detailed taxes — unchanged.

## Boundary proof (§2.1)

No Prisma service injected into the DynamicTable engine (asserted by
`features/dynamicTables/__tests__/no-accounting-imports.boundary.test.ts`). Bridges live in the
accounting world, invoked post-commit from the controller and the transition services. Money is
integer cents; float→cents isolated in each mapper. Idempotency is the Prisma `@@unique`, not preset
`unique`. `immutableAfter` is never loosened; the only state mutation path is a dedicated transition
service using the call-context `isSystem` flag with a literal whitelist.

## Consequences

- Cancelled/Returned sales reverse correctly; Returned preserves gross revenue via contra-account 3.2.
- Paid sales clear `A Receber` to the right destination per method; card receivables sit in 1.1.4
  until Incremento F books the acquirer payout — accepted, documented.
- Reconcile gains passes for settlements, cancellations and returns; a missing-revenue settlement is
  counted as blocked (not failed) and re-driven once revenue exists.
