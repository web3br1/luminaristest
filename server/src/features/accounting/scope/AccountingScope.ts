/**
 * AccountingScope — per-request resolved accounting context.
 *
 * Separates the logical data owner (ownerUserId) from the actor performing the
 * operation (actorUserId). Today they are always the same user; the split avoids a
 * tenancy refactor when a unit needs to be shared between users — only
 * resolveAccountingScope() changes, not every table.
 *
 * ledgerCode, baseCurrencyCode, and timeZone are domain constants for now. Including
 * them in the scope means the future multi-ledger/currency work slots in cleanly.
 */
export interface AccountingScope {
  /** Logical owner of the accounting data — maps to userId in DB rows. */
  ownerUserId: string;
  /** User performing the action — used for authorship (createdById, postedById). */
  actorUserId: string;
  /** Business unit scoped string (a DynamicTable row id used as plain scope key). */
  unitId: string;
  /** Single implicit ledger — no Ledger table yet. */
  ledgerCode: 'DEFAULT';
  /** Base currency code for this scope. */
  baseCurrencyCode: 'BRL';
  /** Locale time zone for period resolution. */
  timeZone: 'America/Sao_Paulo';
}

/**
 * Resolves an AccountingScope from an authenticated user and a unitId.
 * Today owner === actor === logged-in user.
 */
export function resolveAccountingScope(
  user: { userId: string },
  unitId: string,
): AccountingScope {
  // ponytail: membership check entra quando unidade for compartilhada
  return {
    ownerUserId: user.userId,
    actorUserId: user.userId,
    unitId,
    ledgerCode: 'DEFAULT',
    baseCurrencyCode: 'BRL',
    timeZone: 'America/Sao_Paulo',
  };
}

/** Returns a Prisma-compatible { userId, unitId } where-clause derived from a scope. */
export function accountingScopeWhere(scope: AccountingScope): { userId: string; unitId: string } {
  return { userId: scope.ownerUserId, unitId: scope.unitId };
}
