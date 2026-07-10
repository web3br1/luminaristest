import { ExerciseClosingService } from '../ExerciseClosingService';
import { ForbiddenError, ValidationError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { MAX_CENTS } from '../../models/money';
import type { Account } from 'generated/prisma';
import type { PostEntryInput } from '../../dtos/PostingDto';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function acc(over: Partial<Account>): Account {
  return {
    id: over.code, userId: 'owner-1', unitId: 'unit-1', code: '1', name: 'X', nature: 'Asset',
    acceptsEntries: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as Account;
}

const ACCOUNTS: Account[] = [
  acc({ code: '1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true }),
  acc({ code: '3.1', name: 'Receita', nature: 'Revenue', acceptsEntries: true }),
  acc({ code: '4.1', name: 'Despesa', nature: 'Expense', acceptsEntries: true }),
  acc({ code: '2.3.1', name: 'Lucros Acumulados', nature: 'Equity', acceptsEntries: true }),
  acc({ code: '3', name: 'Receita (grupo)', nature: 'Revenue', acceptsEntries: false }),
];

/** balances is accountId(=code here) -> { debitCents, creditCents } for the pre-close read. */
function build(balances: Record<string, { debitCents: number; creditCents: number }>, opts: { canPost?: boolean } = {}) {
  const groupByAccount = jest.fn(async () =>
    Object.entries(balances).map(([accountId, v]) => ({ accountId, ...v })),
  );
  const postEntry = jest.fn(async (_s: unknown, input: PostEntryInput) => ({ id: 'closing-1', ...input }));
  const service = new ExerciseClosingService(
    { findManyByUnit: jest.fn(async () => ACCOUNTS) } as never,
    { groupByAccount } as never,
    { postEntry } as never,
    { canPost: () => opts.canPost ?? true } as never,
  );
  return { service, groupByAccount, postEntry };
}

function sums(lines: PostEntryInput['lines']) {
  return {
    debit: lines.reduce((s, l) => s + l.debitCents, 0),
    credit: lines.reduce((s, l) => s + l.creditCents, 0),
  };
}

describe('ExerciseClosingService.closeExercise', () => {
  it('posts a balanced closing entry that zeroes each result account; profit credits retained earnings', async () => {
    // Receita saldo credor 1500,00 (b=-150000); Despesa saldo devedor 900,00 (b=+90000). Lucro 600,00.
    const { service, groupByAccount, postEntry } = build({
      '3.1': { debitCents: 0, creditCents: 150000 },
      '4.1': { debitCents: 90000, creditCents: 0 },
    });
    await service.closeExercise(scope, 2026);

    // Pre-close read is the ANNUAL window [1 Jan .. 31 Dec], excluding closing entries (B1/D7):
    // the 1 Jan lower bound is what keeps a second annual close correct.
    const readOpts = (groupByAccount.mock.calls[0] as unknown[])[2] as { from: Date; to: Date; excludeSourceTypes: string[] };
    expect(readOpts.excludeSourceTypes).toEqual(['closing']);
    expect(readOpts.from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(readOpts.to.toISOString().slice(0, 10)).toBe('2026-12-31');

    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe('closing');
    expect(input.sourceId).toBe('2026');
    expect(input.date).toBe('2026-12-31');
    // Receita (credor) is debited to zero it; Despesa (devedor) is credited.
    expect(input.lines).toContainEqual({ accountCode: '3.1', debitCents: 150000, creditCents: 0 });
    expect(input.lines).toContainEqual({ accountCode: '4.1', debitCents: 0, creditCents: 90000 });
    // Profit 600,00 → credit retained earnings (increases equity).
    expect(input.lines).toContainEqual({ accountCode: '2.3.1', debitCents: 0, creditCents: 60000 });
    // Balanced.
    const { debit, credit } = sums(input.lines);
    expect(debit).toBe(credit);
    expect(debit).toBe(150000);
  });

  it('net loss debits retained earnings', async () => {
    // Receita 900,00 (b=-90000); Despesa 1500,00 (b=+150000). Prejuízo 600,00.
    const { service, postEntry } = build({
      '3.1': { debitCents: 0, creditCents: 90000 },
      '4.1': { debitCents: 150000, creditCents: 0 },
    });
    await service.closeExercise(scope, 2026);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.lines).toContainEqual({ accountCode: '2.3.1', debitCents: 60000, creditCents: 0 });
    const { debit, credit } = sums(input.lines);
    expect(debit).toBe(credit);
  });

  it('exact break-even (revenue == expense) posts NO retained-earnings leg but still balances', async () => {
    const { service, postEntry } = build({
      '3.1': { debitCents: 0, creditCents: 100000 },
      '4.1': { debitCents: 100000, creditCents: 0 },
    });
    await service.closeExercise(scope, 2026);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.lines.find((l) => l.accountCode === '2.3.1')).toBeUndefined();
    const { debit, credit } = sums(input.lines);
    expect(debit).toBe(credit);
    expect(debit).toBe(100000);
  });

  it('throws when there is no result balance to close (no entry posted)', async () => {
    const { service, postEntry } = build({ '1.1': { debitCents: 5000, creditCents: 0 } });
    await expect(service.closeExercise(scope, 2026)).rejects.toBeInstanceOf(ValidationError);
    expect(postEntry).not.toHaveBeenCalled();
  });

  it('rejects a result balance above the Int32 cents ceiling (ACC-014)', async () => {
    const { service, postEntry } = build({
      '3.1': { debitCents: 0, creditCents: MAX_CENTS + 1 },
    });
    await expect(service.closeExercise(scope, 2026)).rejects.toBeInstanceOf(ValidationError);
    expect(postEntry).not.toHaveBeenCalled();
  });

  it('denies when the caller cannot post', async () => {
    const { service } = build({ '3.1': { debitCents: 0, creditCents: 1 } }, { canPost: false });
    await expect(service.closeExercise(scope, 2026)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('B1: a SECOND annual close only closes the CURRENT year (does not re-inflate a prior closed year)', async () => {
    // Ledger where 2026 (revenue 1000) is already closed; 2027 has revenue 500. An all-history read
    // that excludes every closing would see 1000+500=1500; the annual [1 Jan 2027 ..] window sees 500.
    const groupByAccount = jest.fn(
      async (_s: unknown, _st: string[], opts?: { from?: Date; to?: Date; excludeSourceTypes?: string[] }) => {
        const isCurrentYear = opts?.from && opts.from.getUTCFullYear() === 2027;
        // credit magnitude: current-year window → 500; unbounded/all-history → 1500 (the bug).
        return [{ accountId: '3.1', debitCents: 0, creditCents: isCurrentYear ? 500 : 1500 }];
      },
    );
    const postEntry = jest.fn(async (_s: unknown, input: PostEntryInput) => ({ id: 'c', ...input }));
    const service = new ExerciseClosingService(
      { findManyByUnit: jest.fn(async () => ACCOUNTS) } as never,
      { groupByAccount } as never,
      { postEntry } as never,
      { canPost: () => true } as never,
    );

    await service.closeExercise(scope, 2027);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    // Closes ONLY the 500 operational result of 2027 (a debit of 500 to zero the revenue) — not 1500.
    expect(input.lines).toContainEqual({ accountCode: '3.1', debitCents: 500, creditCents: 0 });
    expect(input.lines.find((l) => l.accountCode === '3.1')!.debitCents).toBe(500);
  });
});
