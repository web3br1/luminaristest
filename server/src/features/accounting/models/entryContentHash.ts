import { createHash } from 'crypto';

/**
 * contentHash — the frozen ECONOMIC content of a journal entry (ADR-INCR-APPROVAL,
 * ACC-017/022/023). Computed at `submit` and re-verified at `approve`. It MUST cover
 * everything that determines the money impact so a maker cannot alter debit/credit/account/
 * date after a checker approved (risk #1). Derived/lifecycle fields (entryNumber, version,
 * status, timestamps, ids) are DELIBERATELY excluded — they change through the lifecycle
 * without changing WHAT was approved.
 *
 * Deterministic: postings are sorted by (accountId, debitCents, creditCents) so leg order
 * never changes the hash; money is integer cents (Contract §2.1); the date is reduced to
 * the calendar day (the ledger keys on the date, not the time component).
 */
export interface HashablePosting {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

export function computeEntryContentHash(input: {
  date: Date;
  description: string;
  postings: HashablePosting[];
}): string {
  const legs = [...input.postings]
    .map((p) => ({ a: p.accountId, d: p.debitCents, c: p.creditCents }))
    .sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.d - y.d || x.c - y.c));
  const canonical = JSON.stringify({
    date: input.date.toISOString().slice(0, 10),
    description: input.description,
    legs,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
