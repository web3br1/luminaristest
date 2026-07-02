/**
 * Shared money limits for the accounting ledger (integer cents).
 *
 * MAX_CENTS is the PERSISTENCE ceiling: `Posting.debitCents`/`creditCents` are Prisma `Int`
 * (signed 32-bit), so any single leg above this is rejected by the DB at write time with an
 * opaque `POST_FAILED` at commit. Both write surfaces guard against it UP FRONT so an
 * over-ceiling value fails as a clear validation issue at the API boundary instead:
 *   - the import validators (`dataExchangeValidators`) — ACC-INCR6-J-001;
 *   - the direct `/post` DTO (`PostingDto`) — ACC-HARDEN-POST-CENTS-001.
 *
 * ponytail: ceiling is Int32; raise to BigInt (schema Int→BigInt + BigInt read-side sweep)
 * only if a real posting leg ever needs to exceed ~R$21.47M.
 */
export const MAX_CENTS = 2_147_483_647;
