import { CrmReceivableBridge, crmDocumentNumber, type WonOpportunityFact } from '../CrmReceivableBridge';
import { ValidationError } from '../../../../../lib/errors';
import { MAX_CENTS } from '../../../models/money';
import type { AccountingScope } from '../../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

function fact(over: Partial<WonOpportunityFact> = {}): WonOpportunityFact {
  return {
    opportunityId: 'opp-1',
    unitId: 'unit-1',
    amount: 1234.56,
    occurredAt: '2026-06-25T14:30:00.000Z',
    label: 'Acme — Projeto X',
    accountRef: 'acc-row-1',
    ...over,
  };
}

function buildBridge(over: {
  createReceivable?: jest.Mock;
  findAnyByDocumentNumber?: jest.Mock;
  findByCode?: jest.Mock;
  findEntryBySource?: jest.Mock;
} = {}) {
  const createReceivable =
    over.createReceivable ?? jest.fn(async () => ({ id: 'recv-1' }));
  const findAnyByDocumentNumber = over.findAnyByDocumentNumber ?? jest.fn(async () => null);
  const findByCode = over.findByCode ?? jest.fn(async () => ({ id: 'acct-3-1', code: '3.1' }));
  const findEntryBySource = over.findEntryBySource ?? jest.fn(async () => null);

  const bridge = new CrmReceivableBridge(
    { createReceivable } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[0],
    { findAnyByDocumentNumber } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[1],
    { findByCode } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[2],
    { findEntryBySource } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[3],
  );
  return { bridge, createReceivable, findAnyByDocumentNumber, findByCode, findEntryBySource };
}

describe('CrmReceivableBridge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the receivable with the CRM business key, sliced date-only and exact cents', async () => {
    const { bridge, createReceivable } = buildBridge();

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'created', receivableId: 'recv-1' });
    expect(createReceivable).toHaveBeenCalledTimes(1);
    const [passedScope, input] = createReceivable.mock.calls[0]!;
    expect(passedScope).toBe(scope);
    expect(input).toEqual({
      unitId: 'unit-1',
      customerName: 'Acme — Projeto X',
      customerRef: 'acc-row-1',
      documentNumber: 'CRM-opp-1',
      description: 'Receita CRM — Acme — Projeto X',
      issueDate: '2026-06-25',
      dueDate: '2026-06-25',
      amountCents: 123456, // 1234.56 reais — the classic parse killer stays exact here
      revenueAccountId: 'acct-3-1',
    });
  });

  it('legacy guard: an opportunity booked by the retired direct route is left alone', async () => {
    const { bridge, createReceivable } = buildBridge({
      findEntryBySource: jest.fn(async () => ({ id: 'entry-legacy' })),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'legacy_entry' });
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('dedupe guard: an existing receivable (live) short-circuits without creating', async () => {
    const { bridge, createReceivable, findAnyByDocumentNumber } = buildBridge({
      findAnyByDocumentNumber: jest.fn(async () => ({ id: 'recv-existing' })),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'already_booked' });
    expect(findAnyByDocumentNumber).toHaveBeenCalledWith(scope, crmDocumentNumber('opp-1'));
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('dedupe guard is tombstone-aware: a user-cancelled receivable is never resurrected', async () => {
    // The repo finder matches the rename-on-delete form too — from the bridge's view it just
    // returns the cancelled row; assert the bridge treats it as already booked.
    const { bridge, createReceivable } = buildBridge({
      findAnyByDocumentNumber: jest.fn(async () => ({
        id: 'recv-cancelled',
        status: 'CANCELLED',
        documentNumber: 'deleted:recv-cancelled:CRM-opp-1',
      })),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'already_booked' });
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it.each([
    ['NaN', NaN],
    ['non-finite', Infinity],
    ['zero', 0],
    ['negative', -10],
    ['above MAX_CENTS', (MAX_CENTS + 1) / 100],
  ])('rejects bad money (%s) with ValidationError before touching any collaborator', async (_k, amount) => {
    const { bridge, createReceivable, findEntryBySource } = buildBridge();

    await expect(bridge.bookWonOpportunity(scope, fact({ amount }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(findEntryBySource).not.toHaveBeenCalled();
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('rejects a calendar-invalid closedAt (2026-02-30 rolls over in Date — slice+round-trip catches it)', async () => {
    const { bridge, createReceivable } = buildBridge();

    await expect(
      bridge.bookWonOpportunity(scope, fact({ occurredAt: '2026-02-30T10:00:00.000Z' })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('surfaces a missing 3.1 revenue account as ValidationError (chart not seeded)', async () => {
    const { bridge, createReceivable } = buildBridge({ findByCode: jest.fn(async () => null) });

    await expect(bridge.bookWonOpportunity(scope, fact())).rejects.toBeInstanceOf(ValidationError);
    expect(createReceivable).not.toHaveBeenCalled();
  });
});
