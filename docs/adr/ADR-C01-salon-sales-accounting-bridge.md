# ADR-C01 — Salon Sales Accounting Bridge

- **Status:** Approved (R2/Q3 ratified) — implemented on `feat/salon-sales-accounting-bridge`
- **Date:** 2026-06-25
- **Decision class:** PRISMA_FIRST_CLASS with source DynamicTable
- **Depends on:** AccountingSync B.1 (PR #5, merged)
- **Supersedes:** none · **Related:** ADR-B01 (AccountingSync idempotency)

## Context

Salon sales are DynamicTable rows (`sales` table of `BeautySalonPreset`); the accounting
ledger is first-class Prisma (`Account`/`JournalEntry`/`Posting`). Until now only the CRM
booked entries (`CrmOpportunityWonMapper`); a finalized salon sale produced **no** journal
entry. The integration must live at the controller/bridge layer post-commit, never inside
the DynamicTable engine (Contract §2.1).

A decisive domain fact: the `sales` schema has `immutableAfter` with
`status ∈ {Finalized,Cancelled,Returned} → scope 'all'`. A sale is frozen the instant it
becomes `Finalized`, so the only successful `updateTableData` that yields `Finalized` is the
single `Draft→Finalized` transition — a natural one-shot. Idempotency is still enforced
hard by PostingService's `@@unique([userId,unitId,sourceType,sourceId])`.

## Decision (ratified model)

| Aspect | Value |
|---|---|
| Trigger | `sale.status === 'Finalized'` (paymentStatus **ignored** for recognition) |
| sourceType | `salon.sale.finalized` |
| sourceId | `saleId` (DynamicTableData row id) |
| Value | `totalAmount` (gross) |
| Accounting date | `sale.data.date` |
| unitId | `sale.data.unitId` (never defaulted) |
| Debit | `1.1.2` (A Receber) |
| Credit | `3.1` (Receita de Vendas) |

**R2/Q3 ratified:** even when `paymentStatus === 'Paid'`, the initial entry goes to **A
Receber**, for consistency with the CRM-Won model (recognize at the commercial fact). The
settlement (A Receber → Caixa/Banco/Pix/Cartão) is a **separate Incremento D** — out of
scope here, along with card/Pix fees, acquirer reconciliation and cash.

**Out of scope (Incremento C):** Cancelled/Returned reversal (`reverseEntry`) → Incremento D;
schema/migrations; fiscal/NF-e; stock; commission; detailed taxes; frontend; new endpoints.

## Architecture

- New union variant + builder in `features/accounting/sync/AccountingSyncPort.ts`
  (`buildSalonSaleFinalizedEvent`).
- New mapper `features/accounting/sync/mappers/SalonSaleFinalizedMapper.ts` — clones the CRM
  money boundary: `isFinite → Math.round(amount*100) → isSafeInteger → > 0`; accounts
  `1.1.2`/`3.1`; description `Receita salão — Venda {saleId}`.
- New bridge `features/accounting/sync/bridges/SalonSalesAccountingBridge.ts`
  (`maybeSyncSalonSaleFinalized`) — guards (table is the tenant's `sales`+`finance` via
  `findTableByInternalName`+id-match; `status==='Finalized'`; `unitId` present;
  `totalAmount` finite & > 0), builds the event, calls `AccountingSyncService.sync`.
  **Non-fatal**: a sync failure never undoes the sale (mirrors `maybeSyncOpportunityWon`).
- Mapper registered in `lib/factory.ts` alongside `CrmOpportunityWonMapper`.
- Bridge called post-commit in **both** `createTableData` and `updateTableData`
  (`controllers/dynamicTablesController.ts`) — a sale may be born Finalized.
- Reconcile extended (`jobs/accountingSyncReconcile.job.ts`, `reconcileSalonSales`): scans
  `sales` rows with `status='Finalized'` lacking a `salon.sale.finalized` journal entry;
  idempotent; never crosses unit/tenant. Runs as a second pass beside the CRM one.

## Boundary proof (§2.1)

No Prisma service is injected into `DynamicTableService`/`RuleContext`/`RulePlugin`; the
bridge lives in the accounting world and is invoked from the controller. `DynamicTableService`,
`PostingService`, `IPostingRepository`, `schema.prisma` and migrations are untouched.
Idempotency = `@@unique` on the Prisma model (not preset `unique`). Money stored/posted as
integer cents; float→cents isolated in the mapper. A boundary test asserts zero accounting
imports anywhere under `features/dynamicTables/**`.

## Consequences

- Finalized salon sales now book revenue automatically, idempotently and reconcilably.
- A sale recognized at A Receber but already paid will show an open receivable until
  Incremento D adds settlement — accepted, documented here.
- Reconcile is the durability backbone and the only coverage for a create-born-Finalized
  sale if the live trigger fails.
