/**
 * CNAB 240 bank-statement parser (BE-INCR7-CNAB / ADR-INCR7-CNAB).
 *
 * parseCnab is a PURE normalizer to the same {headers, rows} shape parseTable/parseOfx
 * return, so the reconciliation import runs the SAME parseLines validator. These tests pin
 * the domain-ratified rules:
 *  - value (18 digits, 2 implied decimals) -> integer cents by DIRECT read, exact, no float (ACC-014);
 *  - natureza indicator 'C'/'D' -> signed cents (C=+ inflow, D=- outflow), 1:1, never inverted (R1);
 *  - data DDMMAAAA -> YYYY-MM-DD by literal reorder, no Date parse, no UTC day-shift (R... date-only);
 *  - histórico -> description (fallback to document number); document number -> externalRef;
 *  - saldo / non-movement (natureza not C/D) records skipped (R2);
 *  - multi-account file rejected (not "take the first"); CNAB 400 rejected;
 *  - anything inconvertible is emitted raw so parseLines rejects the whole import (all-or-nothing).
 *
 * Fixtures build 240-char Segmento E records at the SAME documented FEBRABAN offsets the parser
 * reads, so the suite verifies the parser's CONTRACT (sign/date/value/saldo/multi-account),
 * independent of any one bank's byte layout (CNAB is "posicional por banco" — ADR §5 R3).
 */
import { parseCnab } from '../cnab';
import { ReconciliationService } from '../../features/accounting/services/ReconciliationService';
import { ValidationError } from '../errors';
import type { AccountingScope } from '../../features/accounting/scope/AccountingScope';

/** Place `value` into a 240-char record at 1-indexed [start..end] (inclusive), left-justified. */
function put(record: string[], start1: number, end1: number, value: string): void {
  const width = end1 - start1 + 1;
  const v = value.slice(0, width).padEnd(width, ' ');
  for (let i = 0; i < width; i++) record[start1 - 1 + i] = v[i];
}

/** Numeric field: right-justified, zero-padded (the CNAB convention for value/date/account). */
function putNum(record: string[], start1: number, end1: number, digits: string): void {
  const width = end1 - start1 + 1;
  put(record, start1, end1, digits.slice(-width).padStart(width, '0'));
}

/** Build one Segmento E (record type '3') 240-char movement record. */
function segE(o: {
  account?: string; // 20-char account identity block (pos 18–37)
  date?: string; // DDMMAAAA (pos 143–150)
  valueCents?: string; // integer cents as it sits in the 18-digit field (pos 151–168)
  nature?: string; // 'C' | 'D' | ' ' (pos 169)
  doc?: string; // document number (pos 196–215)
  history?: string; // histórico/complemento (pos 216–240)
  recordType?: string; // pos 8 (default '3')
  segment?: string; // pos 14 (default 'E')
}): string {
  const r = Array<string>(240).fill(' ');
  put(r, 1, 3, '001'); // banco
  put(r, 8, 8, o.recordType ?? '3');
  put(r, 14, 14, o.segment ?? 'E');
  putNum(r, 18, 37, o.account ?? '00012300000456789012'); // agência+conta identity
  putNum(r, 143, 150, o.date ?? '15062026'); // DDMMAAAA
  putNum(r, 151, 168, o.valueCents ?? '0'); // 18-digit value (already cents)
  put(r, 169, 169, o.nature ?? 'C');
  if (o.doc !== undefined) put(r, 196, 215, o.doc);
  if (o.history !== undefined) put(r, 216, 240, o.history);
  return r.join('');
}

/** File header (record type '0') — width 240, pos 8 = '0' (drives sniff, ignored by parser). */
function fileHeader(): string {
  const r = Array<string>(240).fill(' ');
  put(r, 1, 3, '001');
  put(r, 8, 8, '0');
  return r.join('');
}

/** Wrap records into a CNAB 240 file buffer (header + records + CRLF-joined). */
function cnabFile(records: string[]): Buffer {
  return Buffer.from([fileHeader(), ...records].join('\r\n'), 'utf8');
}

describe('parseCnab — normalization to InTable', () => {
  it('emits the canonical header order', () => {
    const t = parseCnab(cnabFile([segE({ valueCents: '1000', nature: 'C' })]));
    expect(t.headers).toEqual(['date', 'amountCents', 'description', 'externalRef']);
  });

  it('normalizes a CREDIT (nature C) to positive signed cents', () => {
    const t = parseCnab(cnabFile([segE({ valueCents: '150000', nature: 'C', doc: 'DOC1', history: 'Deposito' })]));
    expect(t.rows).toEqual([['2026-06-15', '150000', 'Deposito', 'DOC1']]);
  });

  it('normalizes a DEBIT (nature D) to negative signed cents', () => {
    const t = parseCnab(cnabFile([segE({ valueCents: '8990', nature: 'D', doc: 'DOC2', history: 'Tarifa' })]));
    expect(t.rows).toEqual([['2026-06-15', '-8990', 'Tarifa', 'DOC2']]);
  });

  it('reads the 18-digit value field DIRECTLY as cents (2 implied decimals, no float)', () => {
    // R$ 1.500,00 sits as the integer 150000 in the field — the last two digits ARE the cents.
    const cases: Array<[string, string, string]> = [
      ['150000', 'C', '150000'], // R$ 1.500,00
      ['1', 'C', '1'], // R$ 0,01
      ['99', 'D', '-99'], // R$ 0,99 saída
      ['100', 'C', '100'], // R$ 1,00
      ['000000000000012345', 'C', '12345'], // leading zeros stripped
    ];
    for (const [field, nature, cents] of cases) {
      const t = parseCnab(cnabFile([segE({ valueCents: field, nature })]));
      expect(t.rows[0][1]).toBe(cents);
    }
  });

  it('slices DDMMAAAA to YYYY-MM-DD by literal reorder (no Date parse, no UTC shift)', () => {
    expect(parseCnab(cnabFile([segE({ date: '31122026', valueCents: '100', nature: 'C' })])).rows[0][0]).toBe('2026-12-31');
    expect(parseCnab(cnabFile([segE({ date: '01012026', valueCents: '100', nature: 'C' })])).rows[0][0]).toBe('2026-01-01');
  });

  it('emits an invalid date field RAW so parseLines will reject it', () => {
    const t = parseCnab(cnabFile([segE({ date: 'XX062026', valueCents: '100', nature: 'C' })]));
    expect(t.rows[0][0]).toBe('XX062026'); // not 8 digits → emitted raw
  });

  it('builds description from histórico, falling back to the document number when blank', () => {
    expect(parseCnab(cnabFile([segE({ valueCents: '100', nature: 'C', history: 'Pix recebido' })])).rows[0][2]).toBe('Pix recebido');
    // No histórico → fall back to the (always structured) document number, never drop the movement.
    expect(parseCnab(cnabFile([segE({ valueCents: '100', nature: 'C', doc: 'NF-9', history: '' })])).rows[0][2]).toBe('NF-9');
  });

  it('maps the document number to externalRef, empty when absent', () => {
    expect(parseCnab(cnabFile([segE({ valueCents: '100', nature: 'C', doc: 'REF-7' })])).rows[0][3]).toBe('REF-7');
    expect(parseCnab(cnabFile([segE({ valueCents: '100', nature: 'C' })])).rows[0][3]).toBe('');
  });

  it('parses multiple movement records in order', () => {
    const t = parseCnab(
      cnabFile([
        segE({ valueCents: '1000', nature: 'C', doc: 'x', history: 'a' }),
        segE({ valueCents: '2000', nature: 'D', doc: 'y', history: 'b' }),
      ]),
    );
    expect(t.rows.map((r) => r[1])).toEqual(['1000', '-2000']);
    expect(t.rows.map((r) => r[3])).toEqual(['x', 'y']);
  });

  it('SKIPS saldo / non-movement records (natureza neither C nor D)', () => {
    // A saldo record carried in Segmento E with a blank natureza must not become a transaction.
    const t = parseCnab(
      cnabFile([
        segE({ valueCents: '5000', nature: ' ', history: 'SALDO ANTERIOR' }), // skipped
        segE({ valueCents: '1000', nature: 'C', history: 'Movimento' }), // kept
      ]),
    );
    expect(t.rows).toEqual([['2026-06-15', '1000', 'Movimento', '']]);
  });

  it('SKIPS header/trailer and non-E segment records', () => {
    const t = parseCnab(
      cnabFile([
        segE({ valueCents: '999', nature: 'C', segment: 'P' }), // wrong segment → skipped
        segE({ valueCents: '888', nature: 'C', recordType: '5' }), // trailer → skipped
        segE({ valueCents: '1000', nature: 'C', history: 'ok' }), // kept
      ]),
    );
    expect(t.rows).toEqual([['2026-06-15', '1000', 'ok', '']]);
  });

  it('emits a non-numeric value field RAW (parseLines will reject — never guesses)', () => {
    const t = parseCnab(cnabFile([segE({ valueCents: '0', nature: 'C' })].map((rec) => {
      // Corrupt the value field with letters (positions 151–168) to simulate a broken file.
      const arr = rec.split('');
      for (let i = 151 - 1; i <= 168 - 1; i++) arr[i] = 'A';
      return arr.join('');
    })));
    expect(t.rows[0][1]).toBe('AAAAAAAAAAAAAAAAAA');
  });

  it('returns zero rows for a file with only header/trailer (no movement)', () => {
    expect(parseCnab(cnabFile([])).rows).toEqual([]);
  });

  it('REJECTS a multi-account file (never silently attributes to the anchor account)', () => {
    const buf = cnabFile([
      segE({ account: '00012300000456789012', valueCents: '1000', nature: 'C' }),
      segE({ account: '00099900000888777666', valueCents: '2000', nature: 'D' }),
    ]);
    expect(() => parseCnab(buf)).toThrow(ValidationError);
    expect(() => parseCnab(buf)).toThrow(/múltiplas contas/i);
  });

  it('REJECTS a CNAB 400 file (out-of-scope layout)', () => {
    const line400 = '0'.repeat(7) + '0' + '0'.repeat(392); // 400 chars, pos 8 = '0'
    const buf = Buffer.from(line400, 'utf8');
    expect(() => parseCnab(buf)).toThrow(ValidationError);
    expect(() => parseCnab(buf)).toThrow(/400/);
  });
});

// ── End-to-end: CNAB flows through the SAME parseLines gate (all-or-nothing) ─────
describe('ReconciliationService.importStatement — CNAB format', () => {
  const scope: AccountingScope = {
    ownerUserId: 'u1',
    actorUserId: 'u1',
    unitId: 'unit-1',
    ledgerCode: 'DEFAULT',
    baseCurrencyCode: 'BRL',
    timeZone: 'America/Sao_Paulo',
  };
  const dto = {
    glAccountId: 'acc-bank',
    periodStart: new Date('2026-06-01T00:00:00.000Z'),
    periodEnd: new Date('2026-06-30T00:00:00.000Z'),
  };

  function buildService(over: { repo?: Record<string, unknown> } = {}) {
    const repo = {
      findStatementBySha256: jest.fn(async () => null),
      findLinesByStatement: jest.fn(async () => []),
      createStatement: jest.fn(async () => ({ id: 'st1' })),
      createLines: jest.fn(async () => 1),
      runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
      ...over.repo,
    };
    const accountRepo = { findById: jest.fn(async () => ({ id: 'acc-bank', acceptsEntries: true })) };
    const policy = { canReconcile: jest.fn(() => true), canRead: jest.fn(() => true) };
    const audit = { append: jest.fn(async () => undefined) };
    const svc = new ReconciliationService(repo as never, accountRepo as never, policy as never, audit as never);
    return { svc, repo };
  }

  beforeEach(() => jest.clearAllMocks());

  it('imports a valid CNAB, writing the normalized signed lines', async () => {
    const { svc, repo } = buildService();
    const buf = cnabFile([
      segE({ valueCents: '150000', nature: 'C', doc: 'A1', history: 'Dep' }),
      segE({ valueCents: '8990', nature: 'D', doc: 'A2', history: 'Tar' }),
    ]);
    const res = await svc.importStatement(scope, dto as never, { buffer: buf, format: 'cnab' });

    expect(res.created).toBe(true);
    expect(res.lineCount).toBe(2);
    const lines = (repo.createLines as jest.Mock).mock.calls[0][0] as Array<{ amountCents: number; date: Date; externalRef: string | null }>;
    expect(lines.map((l) => l.amountCents)).toEqual([150000, -8990]);
    expect(lines[0].date.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(lines.map((l) => l.externalRef)).toEqual(['A1', 'A2']);
  });

  it('rejects the WHOLE import when any CNAB line is invalid (all-or-nothing, nothing written)', async () => {
    const { svc, repo } = buildService();
    // One good movement + one with a corrupt (non-numeric) value field → parseLines rejects the batch.
    const good = segE({ valueCents: '1000', nature: 'C', doc: 'ok' });
    const badArr = segE({ valueCents: '0', nature: 'C', doc: 'bad' }).split('');
    for (let i = 151 - 1; i <= 168 - 1; i++) badArr[i] = 'A';
    const buf = cnabFile([good, badArr.join('')]);
    await expect(svc.importStatement(scope, dto as never, { buffer: buf, format: 'cnab' })).rejects.toThrow(ValidationError);
    expect(repo.createStatement).not.toHaveBeenCalled();
    expect(repo.createLines).not.toHaveBeenCalled();
  });
});
