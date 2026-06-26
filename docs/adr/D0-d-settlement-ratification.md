# D0 — Human Ratification · Phase D-settlement (Incremento D)

- **Status:** RETROACTIVELY_RATIFIED
- **Ratified by:** web3br1 · **Ratification date:** 2026-06-26
- **Scope:** D-settlement only. Independent of D0-d-reversal.
- **Governs:** ADR-D01 §"Decision — D-settlement". Satisfies gate **G0** for the D-settlement phase.

> **Process note.** The implementation existed before this record was persisted. These decisions
> reflect human ratifications made during the discovery session and were written to disk afterward
> to close the governance gap found by review. This document does not claim the ideal order
> (ADR/D0 → implementation → review) was followed; the real order was implementation → ratification
> persisted afterward → re-review. It records the ratified decisions now used to audit the code.

Records the decisions a human ratified for clearing `A Receber` to the destination account per
payment method. Code cites these by reference (D1-Q1, D1-Q5, D1-Q6, D1-Q10, D1-QMAP, D1-Q11, D1-Q2).

| Ref | Question | Ratified answer |
|---|---|---|
| D1-Q1 | Settlement trigger | `Finalized && Paid`, reached via **`RegisterPayment`** (D1-Q11), not generic update. |
| D1-Q5 | Card gross vs net | **Gross.** Card → intermediate `A Receber Cartão/Adquirente`, **not** Banco. |
| D1-Q6 | Card/acquirer fee in D? | **Out** → Incremento F (`salon.card.payout.settled`). |
| D1-Q10 | Package Balance | `D 2.1.1 Pacotes Pré-pagos (Liability) / C 1.1.2`. **Never cash.** Missing account → block, no fallback. |
| D1-Q2 | Settlement date | New `paidAt` field. |
| D1-Q11 | Finalized→Paid mechanism | **`RegisterPayment`/`SettleSale`** systemic transition, literal whitelist. Generic update NOT approved; global `immutableAfter` bypass NOT approved; restricted systemic bypass approved. |

## D1-QMAP — `paymentMethod → settlement debit` (ratified)

Credit always `1.1.2 A Receber`; value always `totalAmount` gross, converted to cents in the mapper.

| paymentMethod | Debit | Code |
|---|---|---|
| Cash | Caixa | `1.1.3` |
| Pix | Banco | `1.1.1` |
| Debit Card | A Receber Cartão/Adquirente | `1.1.4` |
| Credit Card | A Receber Cartão/Adquirente | `1.1.4` |
| Package Balance | Pacotes Pré-pagos | `2.1.1` |

```
sourceType = salon.sale.settled
sourceId   = saleId
trigger    = status Finalized + paymentStatus Paid
credit     = 1.1.2 A Receber ; amount = totalAmount gross
```

## Chart-of-accounts extension (ratified)

```
{ code:'1.1.4', name:'A Receber Cartão / Adquirente', nature:'Asset',     acceptsEntries:true  }
{ code:'2',     name:'Passivo',                        nature:'Liability', acceptsEntries:false }
{ code:'2.1.1', name:'Pacotes Pré-pagos',              nature:'Liability', acceptsEntries:true  }
```
Consistent with the existing fixture (leaves directly under a root, e.g. `1.1.1` under `1`).

## RegisterPayment contract (ratified)

- Dedicated endpoint (`POST …/sales/:saleId/register-payment`). Requires `sale.status==='Finalized'`;
  if already `Paid` → idempotent success.
- **Whitelist (editable):** `paymentStatus='Paid'`, `paymentMethod`, `paidAt`, `paidByUserId`,
  `paymentReference` (opt. `settlementRequestedAt`, `settlementSource`).
- **Frozen (never touched):** `status`, `unitId`, `customerId`, `totalAmount`, `subtotal`,
  `discountAmount`, `taxAmount`, `saleItems`, `date`.
- Generic `immutableAfter` stays intact; only this service has the restricted systemic bypass, and
  it lives outside the DynamicTable engine.
- Post-commit emits `salon.sale.settled`; accounting failure is non-fatal and reconcilable.

## Ordering invariant (ratified)

Settlement is refused with `blocked_missing_revenue_entry` until `salon.sale.finalized` exists —
never clear a non-existent receivable. Package Balance with a missing `2.1.1` account →
`blocked_missing_prepaid_liability_account`, never a cash fallback.

## Spawned future arcs

- **Incremento F** — Acquirer Payout & Card Fees: `salon.card.payout.settled` →
  `D Banco (net) / D Despesa Taxa Cartão / C 1.1.4`.
- **Deferred** — prepaid-package origination: `D Caixa/Banco/Pix/Cartão / C 2.1.1` (the liability is
  born; D-settlement only consumes the balance).
