/**
 * ReconciliationDto — pins the PR3 review fixes as regressions:
 *  - MAJOR-1: `ignored` is a STRICT boolean ('false' string must fail, never flip to true);
 *  - MINOR-1: ''/null control-totals mean "not provided" (undefined), never 0;
 *  - MINOR-2: dates are date-only YYYY-MM-DD parsed at UTC midnight (no day-shift);
 *  - MINOR-3: duplicated postingIds fail as a clean 400, not an opaque tx error.
 */
import {
  ImportBankStatementSchema,
  ManualMatchSchema,
  PendingReportQuerySchema,
  SetLineIgnoredSchema,
} from '../ReconciliationDto';

describe('SetLineIgnoredSchema — strict boolean (MAJOR-1)', () => {
  const base = { unitId: 'u1', statementLineId: 'line1' };

  it("rejects the string 'false' (would Boolean()-flip to true under coerce)", () => {
    expect(SetLineIgnoredSchema.safeParse({ ...base, ignored: 'false' }).success).toBe(false);
  });

  it('rejects arbitrary truthy junk', () => {
    expect(SetLineIgnoredSchema.safeParse({ ...base, ignored: {} }).success).toBe(false);
    expect(SetLineIgnoredSchema.safeParse({ ...base, ignored: 'no' }).success).toBe(false);
  });

  it('accepts real booleans', () => {
    expect(SetLineIgnoredSchema.safeParse({ ...base, ignored: true }).success).toBe(true);
    expect(SetLineIgnoredSchema.safeParse({ ...base, ignored: false }).success).toBe(true);
  });
});

describe('ImportBankStatementSchema — control-totals and dates', () => {
  const base = {
    unitId: 'u1',
    glAccountId: 'acc1',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
  };

  it("''/null control-totals mean not-provided (undefined), never 0 (MINOR-1)", () => {
    const parsed = ImportBankStatementSchema.safeParse({
      ...base,
      openingBalanceCents: '',
      closingBalanceCents: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openingBalanceCents).toBeUndefined();
      expect(parsed.data.closingBalanceCents).toBeUndefined();
    }
  });

  it('accepts signed control-totals (overdraft) within ±MAX_CENTS', () => {
    const parsed = ImportBankStatementSchema.safeParse({ ...base, closingBalanceCents: '-500' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.closingBalanceCents).toBe(-500);
  });

  it('parses date-only at UTC midnight — no day-shift (MINOR-2)', () => {
    const parsed = ImportBankStatementSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.periodEnd.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    }
  });

  it('rejects datetime-with-timezone strings (day-shift class bug)', () => {
    expect(
      ImportBankStatementSchema.safeParse({ ...base, periodEnd: '2026-01-31T23:00:00-03:00' })
        .success,
    ).toBe(false);
  });

  it('rejects non-calendar strings that pass the regex (NaN guard)', () => {
    expect(
      ImportBankStatementSchema.safeParse({ ...base, periodStart: '2026-13-99' }).success,
    ).toBe(false);
  });

  it('rejects periodEnd < periodStart', () => {
    expect(
      ImportBankStatementSchema.safeParse({
        ...base,
        periodStart: '2026-02-01',
        periodEnd: '2026-01-01',
      }).success,
    ).toBe(false);
  });
});

describe('ManualMatchSchema — postingIds dedup (MINOR-3)', () => {
  const base = { unitId: 'u1', statementLineId: 'line1' };

  it('rejects duplicated postingIds', () => {
    expect(
      ManualMatchSchema.safeParse({ ...base, postingIds: ['p1', 'p1'] }).success,
    ).toBe(false);
  });

  it('accepts distinct postingIds (N postings ↔ 1 line, D3)', () => {
    expect(
      ManualMatchSchema.safeParse({ ...base, postingIds: ['p1', 'p2'] }).success,
    ).toBe(true);
  });
});

describe('PendingReportQuerySchema — window', () => {
  it("rejects 'to' < 'from'", () => {
    expect(
      PendingReportQuerySchema.safeParse({
        unitId: 'u1',
        glAccountId: 'acc1',
        from: '2026-02-01',
        to: '2026-01-01',
      }).success,
    ).toBe(false);
  });
});
