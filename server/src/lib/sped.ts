import { isValidDateOnly } from '../features/accounting/models/dates';

/**
 * Pure serializer primitives for the SPED Contábil (ECD) text file
 * (ADR-INCR-SPED-ECD). Mirrors the pure-lib pattern of `ofx.ts`/`cnab` — no
 * model, no I/O, no Prisma — so the format-critical logic (the money, date and
 * determinism class-bugs) is fully unit-testable in isolation.
 *
 * Normative source: Manual de Orientação do Leiaute 9 da ECD — Anexo ao ADE
 * Cofis nº 01/2026 (janeiro/2026). Field-level layouts are consumed by the
 * register builders (added incrementally, each citing the manual page).
 *
 * ECD line format (all registers): pipe-delimited, ONE record per line, the
 * line STARTS and ENDS with `|`:  `|REG|campo2|campo3|...|`. An empty field is
 * an empty string between two pipes (`||`). This is the same convention the
 * manual's "Exemplo de Preenchimento" shows, e.g. `|I150|01012023|31012023|`.
 */

/**
 * Assemble one SPED record line from its already-formatted fields (the first
 * MUST be the register code, e.g. "I150"). Returns `|f0|f1|...|` — leading and
 * trailing pipe included. Fields are emitted verbatim: callers format money via
 * `centsToSpedDecimal`, dates via `spedDate`, and pass "" for an empty field.
 *
 * A `|` inside a field would corrupt the record; the manual forbids the pipe as
 * data, so we reject it loudly rather than silently produce an unparseable file.
 */
export function spedLine(fields: string[]): string {
  for (const f of fields) {
    if (f.includes('|')) {
      throw new Error(`Campo SPED não pode conter '|': ${JSON.stringify(f)}`);
    }
  }
  return `|${fields.join('|')}|`;
}

/**
 * Integer cents -> SPED decimal string: UNSIGNED magnitude, 2 decimals, comma
 * separator, NO thousands separator. e.g. 123456 -> "1234,56"; -5 -> "0,05";
 * 0 -> "0,00".
 *
 * The SIGN is NEVER in the value field — SPED carries it in a separate D/C
 * indicator column (see `dcIndicator`). Derived by integer divmod on the
 * absolute value: NEVER `(cents/100).toFixed(2)` (float drift on large values,
 * ACC-014/T4) and never a locale formatter (would inject a '.' thousands
 * separator the PGE rejects).
 */
export function centsToSpedDecimal(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Valor em centavos deve ser inteiro: ${cents}`);
  }
  const abs = Math.abs(cents);
  const inteiro = Math.trunc(abs / 100);
  const centavos = abs % 100;
  return `${inteiro},${String(centavos).padStart(2, '0')}`;
}

/**
 * Debit/credit indicator for a SIGNED balance in cents. Convention: a debit
 * balance (saldo devedor, debit >= credit) is "D", a credit balance is "C".
 * `balanceCents = debit - credit`, so >= 0 -> "D", < 0 -> "C".
 *
 * ponytail: zero maps to "D". The manual's zero-balance convention for I155 is
 * PVA-3 (PENDENTE-VERIFICAR) — if the PGE expects the account's natural side for
 * a zero balance, pass the nature-aware side explicitly rather than widening
 * this primitive.
 */
export function dcIndicator(balanceCents: number): 'D' | 'C' {
  return balanceCents < 0 ? 'C' : 'D';
}

/**
 * Date-only ISO (`YYYY-MM-DD`) -> SPED date (`DDMMYYYY`, no separators) by
 * LITERAL slice of the string parts. NEVER `new Date(iso)` then read
 * getDate()/format: that is the UTC-shift class-bug (a America/Sao_Paulo
 * `-03:00` offset rolls the calendar day back). Validates the calendar via the
 * shared `isValidDateOnly` (round-trip) first.
 */
export function spedDate(iso: string): string {
  if (!isValidDateOnly(iso)) {
    throw new Error(`Data inválida para SPED (esperado YYYY-MM-DD real): ${iso}`);
  }
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

/**
 * Bloco 9 counters + file total. Given every emitted line (each already a
 * `|REG|...|` string, in file order), produce:
 *   - `byRegister`: Map REG -> occurrence count, for the 9900 records
 *     (`|9900|REG|QTD|`). Per the manual, 9900 has one line PER register type
 *     PRESENT in the file, and MUST also count 9900 itself, 9990 and 9999
 *     (self-reference — PVA-6, applied here; verify final counts against the
 *     PGE).
 *   - `total`: the grand total of lines for `|9999|QTD_LIN|` (includes the 9999
 *     line itself).
 *
 * This is pure counting over the already-built lines, so the counts cannot drift
 * from what is actually written — the source of truth is the line array itself.
 */
export function countRegisters(lines: string[]): { byRegister: Map<string, number>; total: number } {
  const byRegister = new Map<string, number>();
  for (const line of lines) {
    const reg = line.split('|')[1] ?? '';
    byRegister.set(reg, (byRegister.get(reg) ?? 0) + 1);
  }
  return { byRegister, total: lines.length };
}

/**
 * Runnable self-check (ponytail: the money/date/determinism logic leaves one
 * check that fails if it breaks). Not a test framework — asserts + throws.
 * Invoke with `node -r ts-node/register lib/sped.ts` if ts-node is set up, or
 * rely on the jest suite (`__tests__/sped.test.ts`).
 */
export function __selfCheck(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`sped selfCheck: ${msg}`);
  };
  assert(centsToSpedDecimal(123456) === '1234,56', 'cents 123456');
  assert(centsToSpedDecimal(-5) === '0,05', 'cents -5 magnitude');
  assert(centsToSpedDecimal(0) === '0,00', 'cents 0');
  assert(dcIndicator(-1) === 'C' && dcIndicator(0) === 'D' && dcIndicator(1) === 'D', 'dc');
  // Date at year boundary must NOT shift under a negative TZ offset.
  assert(spedDate('2026-01-01') === '01012026', 'date jan 1');
  assert(spedLine(['I150', '01012026', '31012026']) === '|I150|01012026|31012026|', 'line');
  const { byRegister, total } = countRegisters(['|0000|x|', '|I150|a|', '|I150|b|']);
  assert(byRegister.get('I150') === 2 && total === 3, 'count');
}
