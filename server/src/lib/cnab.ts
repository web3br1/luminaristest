import { ValidationError } from './errors';
import type { InTable } from './spreadsheet';

/**
 * Minimal CNAB 240 bank-statement parser for the accounting reconciliation import
 * (BE-INCR7-CNAB / ADR-INCR7-CNAB). It is a pure NORMALIZER: it turns each Segmento E
 * movement record into a row of the SAME `InTable` shape that `parseTable`/`parseOfx`
 * return, so the import runs the SAME `parseLines` validator with ZERO duplicated
 * validation — one gate for CSV, XLSX, OFX and CNAB alike.
 *
 * CNAB is fixed-width POSITIONAL: each record is 240 chars (FEBRABAN standard), one per
 * line. Emits header `date,amountCents,description,externalRef` from the Segmento E
 * detail record:
 *   - Data do lançamento (DDMMAAAA) -> YYYY-MM-DD by LITERAL reorder of the slice. Never
 *     `new Date(...)`-parse then format: that is the UTC-shift class bug. Note CNAB is
 *     DDMMAAAA (day first) — the OPPOSITE order of OFX's YYYYMMDD, so the slice differs.
 *   - Valor (18 digits, 2 IMPLIED decimals, no point, no sign) -> integer cents by DIRECT
 *     read (strip leading zeros of the digit string). Never `Number(field)` (up to 18
 *     digits > 2^53 loses exactness) and never `decimal*100` — the field IS already cents.
 *   - Natureza indicator ('C'/'D') -> sign: C=+ (inflow/statement credit), D=- (outflow),
 *     1:1 with BankStatementLine.amountCents (signed). A record whose indicator is neither
 *     C nor D is NOT a movement (saldo / header) and is skipped.
 *   - Histórico/complemento -> description, falling back to the document number when blank
 *     (a valid movement is never dropped for a missing free-text label).
 *   - Número do Documento -> externalRef (the bank's dedup hint, NOT import idempotency —
 *     that stays sha256(file), T7/D1).
 *
 * This parser does NOT validate (no isValidDateOnly / MAX_CENTS import): anything it cannot
 * convert exactly is emitted as its RAW token so `parseLines` rejects the whole import
 * all-or-nothing with a per-row error (ACC-014 fails loud, never silently rounds).
 *
 * ponytail: the position constants below are the FEBRABAN-240 Segmento E standard offsets and
 * are the per-bank CALIBRATION point (CNAB is "posicional por banco" — master map §5, ⚫).
 * A bank whose layout deviates from these offsets is the documented tuning knob; adjust the
 * constants (or add a per-bank map) only when a real file needs it. CNAB 400 and CNAB remessa
 * are out of scope (ADR §5) — a 400-wide file is rejected loud.
 */

/** Widened import-boundary format lives in ofx.ts (`SpreadsheetFormat | 'ofx' | 'cnab'`). */

const CNAB_HEADERS = ['date', 'amountCents', 'description', 'externalRef'] as const;

/** 0-indexed [start, end) slices — FEBRABAN 240 "Extrato para Conciliação", Segmento E. */
const POS = {
  recordType: [7, 8], // '3' = detalhe
  segment: [13, 14], // 'E' = movimento de extrato
  account: [17, 37], // agência+DV+conta+DV (identidade de conta p/ guarda multi-conta)
  date: [142, 150], // data do lançamento DDMMAAAA
  value: [150, 168], // valor 18 dígitos, 2 casas decimais IMPLÍCITAS (já em centavos)
  nature: [168, 169], // 'C' crédito (+) / 'D' débito (−)
  documentNumber: [195, 215], // número do documento -> externalRef
  history: [215, 240], // histórico/complemento -> description
} as const;

/** Extract a fixed-width field, trimmed. Out-of-range slices yield '' (short/padded lines). */
function field(line: string, [start, end]: readonly [number, number]): string {
  return line.slice(start, end).trim();
}

/** DDMMAAAA -> YYYY-MM-DD by literal reorder (no Date parse → no UTC shift). Raw if not 8 digits. */
function cnabDateToDateOnly(raw: string): string {
  const s = raw.trim();
  if (!/^\d{8}$/.test(s)) return s; // emit raw so isValidDateOnly (in parseLines) rejects
  return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
}

/**
 * Positional value (18 digits, 2 implied decimals) + D/C indicator -> signed integer-cents
 * STRING, exact (no float). The field IS already cents (last 2 digits are the decimals baked
 * into the integer), so conversion is just stripping leading zeros. Returns the RAW field
 * when it is not all-digits so `parseLines` rejects the whole import.
 */
function cnabAmountToCents(rawValue: string, nature: string): string {
  const digits = rawValue.trim();
  if (!/^\d+$/.test(digits)) return digits; // non-numeric (spaces/garbage) → let parseLines reject
  const cents = digits.replace(/^0+/, '') || '0';
  if (cents === '0') return '0'; // zero (e.g. saldo zerado) → parseLines rejects amountCents==0
  // ponytail: an 18-digit field far exceeds MAX_CENTS; parseLines' /^-?\d+$/ + MAX_CENTS check
  // reject it loudly, so no bignum here — no silent wrong value is ever persisted.
  return nature === 'D' ? `-${cents}` : cents; // C=+ inflow, D=- outflow (1:1 with signed line)
}

/**
 * Build the line description. Histórico/complemento wins; when blank, fall back to the
 * document number so a financially-valid movement is never dropped by parseLines' non-empty
 * rule. A record with neither still yields '' and is rejected all-or-nothing (honest signal).
 */
function cnabDescription(line: string): string {
  return field(line, POS.history) || field(line, POS.documentNumber);
}

/**
 * Parse a CNAB 240 buffer into `{headers, rows}` — one row per Segmento E MOVEMENT record
 * (record type '3', segment 'E', natureza 'C'/'D'). Header/trailer records and saldo /
 * non-movement records (natureza neither C nor D) are skipped. Rejects a multi-account file
 * (>1 distinct account identity): a statement is anchored to ONE bank GL account at import
 * (D4), so ingesting a second account's movements under that anchor would misattribute them.
 * Rejects a CNAB 400 file (a different, out-of-scope layout).
 */
export function parseCnab(buffer: Buffer): InTable {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // CNAB 400 guard — a different layout (ADR §5). Reject loud, never misparse as 240.
  if (lines.length > 0 && lines[0].length >= 400) {
    throw new ValidationError('Arquivo CNAB 400 não é suportado — importe um extrato CNAB 240.');
  }

  const rows: string[][] = [];
  const accountIds = new Set<string>();

  for (const line of lines) {
    if (field(line, POS.recordType) !== '3') continue; // only detail records
    if (field(line, POS.segment).toUpperCase() !== 'E') continue; // only Segmento E (extrato)
    const nature = field(line, POS.nature).toUpperCase();
    if (nature !== 'C' && nature !== 'D') continue; // skip saldo / non-movement (R2)

    const account = field(line, POS.account);
    if (account) accountIds.add(account);

    rows.push([
      cnabDateToDateOnly(field(line, POS.date)),
      cnabAmountToCents(field(line, POS.value), nature),
      cnabDescription(line),
      field(line, POS.documentNumber) || '',
    ]);
  }

  // Multi-account guard — reject, never "take the first" (ADR §3, mirrors parseOfx).
  if (accountIds.size > 1) {
    throw new ValidationError(
      'Arquivo CNAB com múltiplas contas não é suportado — importe uma conta por arquivo.',
    );
  }

  return { headers: [...CNAB_HEADERS], rows };
}
