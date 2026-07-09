/**
 * OFX bank-statement parser (BE-INCR7-OFX / ADR-INCR7-OFX).
 *
 * parseOfx is a PURE normalizer to the same {headers, rows} shape parseTable returns,
 * so the reconciliation import runs the SAME parseLines validator. These tests pin the
 * domain-ratified rules:
 *  - TRNAMT -> integer cents by string arithmetic, exact, no float, no rounding (ACC-014);
 *  - DTPOSTED -> YYYY-MM-DD by literal slice, offset ignored, no UTC day-shift;
 *  - NAME/MEMO -> description; FITID -> externalRef;
 *  - multi-account file rejected (not "take the first");
 *  - anything inconvertible is emitted raw so parseLines rejects the whole import (all-or-nothing).
 */
import { parseOfx } from '../ofx';
import { ReconciliationService } from '../../features/accounting/services/ReconciliationService';
import { ValidationError } from '../errors';
import type { AccountingScope } from '../../features/accounting/scope/AccountingScope';

/** Wrap one or more <STMTTRN> blocks in a minimal single-account OFX 1.x (SGML) envelope. */
function ofxFile(txns: string, opts: { accounts?: number } = {}): Buffer {
  const accounts = opts.accounts ?? 1;
  const stmts = Array.from({ length: accounts }, (_, i) =>
    `<STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>001<ACCTID>1234${i}<ACCTTYPE>CHECKING</BANKACCTFROM>` +
    `<BANKTRANLIST>${i === 0 ? txns : ''}</BANKTRANLIST></STMTRS>`,
  ).join('');
  return Buffer.from(
    `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n` +
      `<OFX><BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>` +
      `${stmts}</STMTTRNRS></BANKMSGSRSV1></OFX>`,
    'utf8',
  );
}

const TXN = (o: {
  amt: string;
  dt?: string;
  fitid?: string;
  name?: string;
  memo?: string;
  trntype?: string;
  checknum?: string;
}): string =>
  `<STMTTRN><TRNTYPE>${o.trntype ?? 'OTHER'}<DTPOSTED>${o.dt ?? '20260615120000[-3:BRT]'}` +
  `<TRNAMT>${o.amt}` +
  (o.checknum !== undefined ? `<CHECKNUM>${o.checknum}` : '') +
  (o.fitid !== undefined ? `<FITID>${o.fitid}` : '') +
  (o.name !== undefined ? `<NAME>${o.name}` : '') +
  (o.memo !== undefined ? `<MEMO>${o.memo}` : '') +
  `</STMTTRN>`;

describe('parseOfx — normalization to InTable', () => {
  it('emits the canonical header order', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '10.00' })));
    expect(t.headers).toEqual(['date', 'amountCents', 'description', 'externalRef']);
  });

  it('normalizes a CREDIT (positive TRNAMT) to positive signed cents', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '1500.00', fitid: 'A1', name: 'Deposito' })));
    expect(t.rows).toEqual([['2026-06-15', '150000', 'Deposito', 'A1']]);
  });

  it('normalizes a DEBIT (negative TRNAMT) to negative signed cents', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '-89.90', fitid: 'A2', memo: 'Tarifa' })));
    expect(t.rows).toEqual([['2026-06-15', '-8990', 'Tarifa', 'A2']]);
  });

  it('parses multiple transactions in order', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '10.00', fitid: 'x' }) + TXN({ amt: '-20.00', fitid: 'y' })));
    expect(t.rows.map((r) => r[1])).toEqual(['1000', '-2000']);
    expect(t.rows.map((r) => r[3])).toEqual(['x', 'y']);
  });

  it('converts decimals exactly by string arithmetic (no float drift)', () => {
    const cases: Array<[string, string]> = [
      ['100.00', '10000'],
      ['100.5', '10050'],
      ['100', '10000'],
      ['-0.99', '-99'],
      ['100.000', '10000'], // trailing zeros past the 2nd place are exact → accepted
      ['0.01', '1'],
      ['-0.1', '-10'],
    ];
    for (const [amt, cents] of cases) {
      const t = parseOfx(ofxFile(TXN({ amt })));
      expect(t.rows[0][1]).toBe(cents);
    }
  });

  it('emits a significant 3rd decimal RAW (parseLines will reject it — never rounds)', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '100.001' })));
    expect(t.rows[0][1]).toBe('100.001'); // unchanged → not an integer cents string
  });

  it('emits a comma-decimal amount RAW (spec is "." — never guesses)', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '100,00' })));
    expect(t.rows[0][1]).toBe('100,00');
  });

  it('slices DTPOSTED to YYYY-MM-DD and IGNORES the timezone offset (no UTC day-shift)', () => {
    // Late-evening BRT timestamp: a naive Date parse to UTC would roll to the next day.
    const t = parseOfx(ofxFile(TXN({ amt: '1.00', dt: '20260615233000[-3:BRT]' })));
    expect(t.rows[0][0]).toBe('2026-06-15');
  });

  it('handles a bare 8-digit DTPOSTED', () => {
    const t = parseOfx(ofxFile(TXN({ amt: '1.00', dt: '20261231' })));
    expect(t.rows[0][0]).toBe('2026-12-31');
  });

  it('builds description from NAME and MEMO (join), or either alone', () => {
    expect(parseOfx(ofxFile(TXN({ amt: '1.00', name: 'N', memo: 'M' }))).rows[0][2]).toBe('N — M');
    expect(parseOfx(ofxFile(TXN({ amt: '1.00', name: 'N' }))).rows[0][2]).toBe('N');
    expect(parseOfx(ofxFile(TXN({ amt: '1.00', memo: 'M' }))).rows[0][2]).toBe('M');
  });

  it('falls back to TRNTYPE (+CHECKNUM/REFNUM) when the bank sends no NAME/MEMO', () => {
    // Structured-only transactions must NOT be dropped by the non-empty-description rule.
    expect(parseOfx(ofxFile(TXN({ amt: '-50.00', trntype: 'DEBIT' }))).rows[0][2]).toBe('DEBIT');
    expect(parseOfx(ofxFile(TXN({ amt: '-50.00', trntype: 'CHECK', checknum: '1234' }))).rows[0][2]).toBe('CHECK 1234');
    // REFNUM enriches when there is no CHECKNUM.
    expect(
      parseOfx(ofxFile(`<STMTTRN><TRNTYPE>XFER<DTPOSTED>20260615<TRNAMT>-50.00<REFNUM>R9</STMTTRN>`)).rows[0][2],
    ).toBe('XFER R9');
    // NAME/MEMO still win over the fallback when present.
    expect(parseOfx(ofxFile(TXN({ amt: '-50.00', trntype: 'DEBIT', memo: 'Pix enviado' }))).rows[0][2]).toBe('Pix enviado');
  });

  it('yields an empty description only for a malformed txn (no NAME/MEMO AND no TRNTYPE)', () => {
    // Raw STMTTRN with neither a label nor a type → '' → parseLines rejects the file (honest signal).
    const broken = Buffer.from(
      `OFXHEADER:100\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>1</BANKACCTFROM>` +
        `<BANKTRANLIST><STMTTRN><DTPOSTED>20260615<TRNAMT>1.00<FITID>x</STMTTRN>` +
        `</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`,
      'utf8',
    );
    expect(parseOfx(broken).rows[0][2]).toBe('');
  });

  it('maps FITID to externalRef, empty when absent', () => {
    expect(parseOfx(ofxFile(TXN({ amt: '1.00', fitid: 'FIT-9' }))).rows[0][3]).toBe('FIT-9');
    expect(parseOfx(ofxFile(TXN({ amt: '1.00' }))).rows[0][3]).toBe('');
  });

  it('parses OFX 2.x (closed XML tags) the same way', () => {
    const xml = Buffer.from(
      `<?xml version="1.0"?><?OFX OFXHEADER="200" VERSION="200"?>` +
        `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL` +
        `<BANKACCTFROM><ACCTID>1</BANKACCTFROM><BANKTRANLIST>` +
        `<STMTTRN><DTPOSTED>20260701</DTPOSTED><TRNAMT>250.50</TRNAMT>` +
        `<FITID>Z9</FITID><NAME>Pix</NAME></STMTTRN>` +
        `</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`,
      'utf8',
    );
    expect(parseOfx(xml).rows).toEqual([['2026-07-01', '25050', 'Pix', 'Z9']]);
  });

  it('returns zero rows for a statement with no transactions', () => {
    expect(parseOfx(ofxFile('')).rows).toEqual([]);
  });

  it('REJECTS a multi-account file (never silently attributes to the anchor account)', () => {
    expect(() => parseOfx(ofxFile(TXN({ amt: '1.00' }), { accounts: 2 }))).toThrow(ValidationError);
    expect(() => parseOfx(ofxFile(TXN({ amt: '1.00' }), { accounts: 2 }))).toThrow(/múltiplas contas/i);
  });
});

// ── End-to-end: OFX flows through the SAME parseLines gate (all-or-nothing) ─────
describe('ReconciliationService.importStatement — OFX format', () => {
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

  it('imports a valid OFX, writing the normalized lines', async () => {
    const { svc, repo } = buildService();
    const buf = ofxFile(TXN({ amt: '1500.00', fitid: 'A1', name: 'Dep' }) + TXN({ amt: '-89.90', fitid: 'A2', memo: 'Tar' }));
    const res = await svc.importStatement(scope, dto as never, { buffer: buf, format: 'ofx' });

    expect(res.created).toBe(true);
    expect(res.lineCount).toBe(2);
    const lines = (repo.createLines as jest.Mock).mock.calls[0][0] as Array<{ amountCents: number; date: Date; externalRef: string | null }>;
    expect(lines.map((l) => l.amountCents)).toEqual([150000, -8990]);
    expect(lines[0].date.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(lines.map((l) => l.externalRef)).toEqual(['A1', 'A2']);
  });

  it('imports a structured-only OFX (no NAME/MEMO) — not dropped, description from TRNTYPE', async () => {
    const { svc, repo } = buildService();
    const buf = ofxFile(TXN({ amt: '-50.00', trntype: 'DEBIT', fitid: 'S1' }));
    const res = await svc.importStatement(scope, dto as never, { buffer: buf, format: 'ofx' });
    expect(res.lineCount).toBe(1);
    const lines = (repo.createLines as jest.Mock).mock.calls[0][0] as Array<{ description: string }>;
    expect(lines[0].description).toBe('DEBIT');
  });

  it('rejects the WHOLE import when any OFX line is invalid (all-or-nothing, nothing written)', async () => {
    const { svc, repo } = buildService();
    // One good line + one with a significant 3rd decimal → parseLines rejects the batch.
    const buf = ofxFile(TXN({ amt: '10.00', fitid: 'ok' }) + TXN({ amt: '100.001', fitid: 'bad' }));
    await expect(svc.importStatement(scope, dto as never, { buffer: buf, format: 'ofx' })).rejects.toThrow(ValidationError);
    expect(repo.createStatement).not.toHaveBeenCalled();
    expect(repo.createLines).not.toHaveBeenCalled();
  });
});
