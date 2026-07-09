import { ValidationError } from './errors';
import type { InTable, SpreadsheetFormat } from './spreadsheet';

/**
 * Minimal OFX bank-statement parser for the accounting reconciliation import
 * (BE-INCR7-OFX / ADR-INCR7-OFX). It is a pure NORMALIZER: it turns each OFX
 * `<STMTTRN>` into a row of the SAME `InTable` shape that `parseTable` returns,
 * so the import runs the SAME `parseLines` validator with ZERO duplicated
 * validation — one gate for CSV, XLSX and OFX alike.
 *
 * Emits header `date,amountCents,description,externalRef` from
 * `<DTPOSTED>,<TRNAMT>,<NAME>/<MEMO>,<FITID>`:
 *   - DTPOSTED (YYYYMMDD[HHMMSS][.XXX][gmt]) -> YYYY-MM-DD by LITERAL slice of the
 *     first 8 digits. Never `new Date(...)`-parse then format: that is the UTC-shift
 *     class bug (a `[-3:BRT]` offset would roll the day). The offset governs the time,
 *     not the calendar date the bank posted.
 *   - TRNAMT (decimal) -> signed integer cents by STRING arithmetic on the parts
 *     (never `Number(decimal) * 100` — float drift, ACC-014/T4).
 *   - NAME/MEMO -> description, falling back to TRNTYPE (+CHECKNUM/REFNUM) when the bank
 *     sends no free-text label, so a structured-only transaction is never dropped.
 *   - FITID -> externalRef (the bank's dedup key, NOT import idempotency — that stays
 *     sha256(file), T7/D1).
 *
 * This parser does NOT validate (no isValidDateOnly / MAX_CENTS import): anything it
 * cannot convert exactly is emitted as its RAW token so `parseLines` rejects the whole
 * import all-or-nothing with a per-row error (ACC-014 fails loud, never silently rounds).
 *
 * ponytail: OFX 1.x is SGML (aggregates closed, leaf elements often unclosed) and 2.x is
 * XML — both are handled by a couple of regexes, no new dependency. Reach for a real OFX
 * library only if a genuine real-world layout breaks this (nested aggregates in a txn,
 * exotic encodings).
 */

/** Widened import-boundary format: the spreadsheet formats plus OFX. */
export type StatementFormat = SpreadsheetFormat | 'ofx';

const OFX_HEADERS = ['date', 'amountCents', 'description', 'externalRef'] as const;

/** Extract a single OFX leaf element value: `<TAG>value` up to the next `<`, CR or LF (SGML or XML). */
function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : '';
}

/**
 * Build the line description. NAME/MEMO (the human free-text labels) win; when the bank
 * emits neither, fall back to the always-present structured fields (TRNTYPE is required by
 * the OFX spec; CHECKNUM/REFNUM enrich it) so a financially-valid transaction is NEVER
 * dropped by parseLines' non-empty-description rule — description is a matching aid, not a
 * ledger invariant. A genuinely malformed STMTTRN (no TRNTYPE either) still yields '' and
 * is rejected all-or-nothing, which is the honest signal for a broken file.
 */
function ofxDescription(block: string): string {
  const rich = [tag(block, 'NAME'), tag(block, 'MEMO')].filter(Boolean).join(' — ');
  if (rich) return rich;
  const type = tag(block, 'TRNTYPE');
  const ref = tag(block, 'CHECKNUM') || tag(block, 'REFNUM');
  return [type, ref].filter(Boolean).join(' ');
}

/** DTPOSTED -> YYYY-MM-DD by literal slice of the first 8 digits (no Date parse → no UTC shift). */
function ofxDateToDateOnly(raw: string): string {
  const s = raw.trim();
  // At least 8 leading digits (YYYYMMDD) per the OFX date spec; otherwise emit raw so parseLines rejects.
  if (!/^\d{8}/.test(s)) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * TRNAMT decimal -> signed integer-cents STRING, exact (no float). Returns the RAW token
 * unchanged when it cannot be represented exactly in cents (non-numeric, comma separator,
 * or a significant 3rd+ decimal place) — parseLines then rejects it loudly.
 */
function ofxAmountToCents(raw: string): string {
  const s = raw.trim();
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s; // non-numeric / comma decimal → let parseLines reject
  const sign = m[1] === '-' ? '-' : '';
  const intPart = m[2];
  let frac = m[3] ?? '';
  if (frac.length > 2) {
    // Exact-only (ACC-014): trailing zeros past the 2nd place are fine; a significant
    // 3rd+ digit is NOT — never round. Emit raw so the whole import is rejected.
    if (/[^0]/.test(frac.slice(2))) return s;
    frac = frac.slice(0, 2);
  }
  frac = frac.padEnd(2, '0');
  // Integer arithmetic on the parts — within MAX_CENTS this is far below 2^53 so it is exact.
  // ponytail: a pathologically huge intPart would overflow to "1e+22"-style notation, which
  // parseLines' /^-?\d+$/ + MAX_CENTS check reject anyway — no silent wrong value, so no bignum.
  const cents = Number(intPart) * 100 + Number(frac);
  if (cents === 0) return '0'; // sign on zero is meaningless; parseLines rejects amountCents==0
  return `${sign}${cents}`;
}

/**
 * Parse an OFX buffer into `{headers, rows}` — one row per `<STMTTRN>`. Rejects a
 * multi-account file (more than one statement/account aggregate): a statement is
 * anchored to ONE bank GL account at import (D4), so ingesting a second account's
 * transactions under that anchor would silently misattribute them.
 */
export function parseOfx(buffer: Buffer): InTable {
  const text = buffer.toString('utf8');

  // Multi-account guard — reject, never "take the first" (ADR-INCR7-OFX domain invariant).
  const accountAggregates = (text.match(/<(?:BANKACCTFROM|CCACCTFROM)>/gi) ?? []).length;
  const statementAggregates = (text.match(/<(?:STMTRS|CCSTMTRS)>/gi) ?? []).length;
  if (accountAggregates > 1 || statementAggregates > 1) {
    throw new ValidationError(
      'Arquivo OFX com múltiplas contas não é suportado — importe uma conta por arquivo.',
    );
  }

  const rows: string[][] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const block = m[1];
    rows.push([
      ofxDateToDateOnly(tag(block, 'DTPOSTED')),
      ofxAmountToCents(tag(block, 'TRNAMT')),
      ofxDescription(block),
      tag(block, 'FITID'),
    ]);
  }

  return { headers: [...OFX_HEADERS], rows };
}
