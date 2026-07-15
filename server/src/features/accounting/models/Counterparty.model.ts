/**
 * Counterparty domain constants (Contraparte fornecedor/cliente — INCR-COUNTERPARTY / A1). Small
 * const/helper file in the style of `Payable.model.ts` / `Dimension.model.ts`: the Prisma row type
 * (`Counterparty`) comes from `generated/prisma`; this file owns the enum-like union (SUPPLIER/
 * CUSTOMER), the audit event keys, and the rename-on-delete helper for the business key.
 *
 * A counterparty is a first-class catalog identity (F-CP1 → A1): the AP/AR subledger points at it by
 * FK (`counterpartyId`, nullable this increment) so aging/posição por contraparte groups by a STABLE,
 * integral key instead of the display-name snapshot. It carries NO money and NO dates of its own.
 */

/** The counterparty kind. A supplier is the AP side; a customer is the AR side. */
export const COUNTERPARTY_TYPES = ['SUPPLIER', 'CUSTOMER'] as const;
export type CounterpartyType = (typeof COUNTERPARTY_TYPES)[number];

/**
 * Audit event keys for catalog management (T8 — every state change is auditable). Creating and
 * archiving a counterparty are the only catalog mutations; the AP/AR link is written inside the
 * payable/receivable create flow (their own audit events already carry the counterpartyId).
 */
export const COUNTERPARTY_CREATED = 'counterparty.created';
export const COUNTERPARTY_ARCHIVED = 'counterparty.archived';

/**
 * Rename-on-delete transform for the business key (SEC-A1-4). On archive, `name` — the varying part
 * of `@@unique([userId,unitId,type,name])` — is rewritten to `deleted:<id>:<name>` in the SAME tx so
 * the original key is freed and an archive+recreate of the same name does not trip P2002
 * (memória unique-de-idempotencia-x-soft-delete). The AP/AR rows keep their OWN name snapshot
 * (supplierName/customerName), so the mangled name never leaks into a subledger read.
 */
export function deletedCounterpartyName(id: string, name: string): string {
  return `deleted:${id}:${name}`;
}
