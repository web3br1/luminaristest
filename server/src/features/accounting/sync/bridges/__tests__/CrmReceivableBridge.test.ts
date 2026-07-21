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

const DOC = crmDocumentNumber('opp-1'); // CRM-opp-1

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

/** Minimal receivable row for guard classification. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'recv-x',
    documentNumber: DOC,
    deletedAt: null,
    cancelledById: null,
    ...over,
  };
}

function buildBridge(over: {
  createReceivable?: jest.Mock;
  cancelReceivable?: jest.Mock;
  findAllByDocumentNumber?: jest.Mock;
  findByCode?: jest.Mock;
  findEntryBySource?: jest.Mock;
  listAccounts?: jest.Mock;
} = {}) {
  const createReceivable = over.createReceivable ?? jest.fn(async () => ({ id: 'recv-1' }));
  const cancelReceivable = over.cancelReceivable ?? jest.fn(async () => ({ id: 'recv-1' }));
  const findAllByDocumentNumber = over.findAllByDocumentNumber ?? jest.fn(async () => []);
  const findByCode = over.findByCode ?? jest.fn(async () => ({ id: 'acct-3-1', code: '3.1' }));
  const findEntryBySource = over.findEntryBySource ?? jest.fn(async () => null);
  const listAccounts = over.listAccounts ?? jest.fn(async () => []);

  const bridge = new CrmReceivableBridge(
    { createReceivable, cancelReceivable } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[0],
    { findAllByDocumentNumber } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[1],
    { findByCode } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[2],
    { findEntryBySource, listAccounts } as unknown as ConstructorParameters<typeof CrmReceivableBridge>[3],
  );
  return {
    bridge,
    createReceivable,
    cancelReceivable,
    findAllByDocumentNumber,
    findByCode,
    findEntryBySource,
    listAccounts,
  };
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

  it('dedupe guard: a LIVE receivable with the exact key short-circuits without creating', async () => {
    const { bridge, createReceivable, findAllByDocumentNumber } = buildBridge({
      findAllByDocumentNumber: jest.fn(async () => [row({ id: 'recv-existing' })]),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'already_booked' });
    expect(findAllByDocumentNumber).toHaveBeenCalledWith(scope, DOC);
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('human cancel (tombstone WITH cancelledById) is final — never resurrected', async () => {
    const { bridge, createReceivable } = buildBridge({
      findAllByDocumentNumber: jest.fn(async () => [
        row({
          id: 'recv-cancelled',
          documentNumber: `deleted:recv-cancelled:${DOC}`,
          deletedAt: new Date(),
          cancelledById: 'u1',
        }),
      ]),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'already_booked' });
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('H1: a machine-compensated FAILED creation (tombstone WITHOUT cancelledById) is retryable', async () => {
    // compensateFailedRecognition soft-deletes + renames but sets NO actor — the bridge must
    // retry, otherwise a transient posting failure silently loses the revenue forever.
    const { bridge, createReceivable } = buildBridge({
      findAllByDocumentNumber: jest.fn(async () => [
        row({
          id: 'recv-failed',
          documentNumber: `deleted:recv-failed:${DOC}`,
          deletedAt: new Date(),
          cancelledById: null,
        }),
      ]),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'created', receivableId: 'recv-1' });
    expect(createReceivable).toHaveBeenCalledTimes(1);
  });

  it('L3: a foreign tombstone that merely ENDS with the key (non-strict shape) never blocks', async () => {
    // Manual receivable doc 'NF-9:CRM-opp-1', cancelled by a human → 'deleted:<rid>:NF-9:CRM-opp-1'.
    // Middle segment contains ':' → not OUR rename-on-delete shape → ignored.
    const { bridge, createReceivable } = buildBridge({
      findAllByDocumentNumber: jest.fn(async () => [
        row({
          id: 'recv-foreign',
          documentNumber: `deleted:recv-foreign:NF-9:${DOC}`,
          deletedAt: new Date(),
          cancelledById: 'u1',
        }),
      ]),
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'created', receivableId: 'recv-1' });
    expect(createReceivable).toHaveBeenCalledTimes(1);
  });

  it('M1 race sweep: the racer that created the HIGHER id cancels its own duplicate', async () => {
    const createReceivable = jest.fn(async () => ({ id: 'recv-b' }));
    const findAllByDocumentNumber = jest
      .fn()
      .mockResolvedValueOnce([]) // guard 2: nothing yet
      .mockResolvedValueOnce([row({ id: 'recv-a' }), row({ id: 'recv-b' })]); // sweep: twins
    const { bridge, cancelReceivable } = buildBridge({
      createReceivable,
      findAllByDocumentNumber: findAllByDocumentNumber as jest.Mock,
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'already_booked' });
    expect(cancelReceivable).toHaveBeenCalledTimes(1);
    const [, cancelledId, dto] = cancelReceivable.mock.calls[0]!;
    expect(cancelledId).toBe('recv-b'); // cancels only the row THIS call created
    expect(dto).toMatchObject({ unitId: 'unit-1', reversalDate: '2026-06-25' });
  });

  it('M1 race sweep: the survivor (lowest id) keeps its receivable and cancels nothing', async () => {
    const createReceivable = jest.fn(async () => ({ id: 'recv-a' }));
    const findAllByDocumentNumber = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row({ id: 'recv-a' }), row({ id: 'recv-b' })]);
    const { bridge, cancelReceivable } = buildBridge({
      createReceivable,
      findAllByDocumentNumber: findAllByDocumentNumber as jest.Mock,
    });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(result).toEqual({ outcome: 'created', receivableId: 'recv-a' });
    expect(cancelReceivable).not.toHaveBeenCalled();
  });

  it('M2: a chart never touched by accounting is seeded once (listAccounts) before resolving 3.1', async () => {
    const findByCode = jest
      .fn()
      .mockResolvedValueOnce(null) // CRM-first tenant: chart not seeded yet
      .mockResolvedValueOnce({ id: 'acct-3-1', code: '3.1' }); // after the idempotent seed
    const { bridge, createReceivable, listAccounts } = buildBridge({ findByCode: findByCode as jest.Mock });

    const result = await bridge.bookWonOpportunity(scope, fact());

    expect(listAccounts).toHaveBeenCalledWith(scope);
    expect(result).toEqual({ outcome: 'created', receivableId: 'recv-1' });
    expect(createReceivable).toHaveBeenCalledTimes(1);
  });

  it('surfaces a 3.1 still missing AFTER the seed as ValidationError', async () => {
    const { bridge, createReceivable, listAccounts } = buildBridge({
      findByCode: jest.fn(async () => null),
    });

    await expect(bridge.bookWonOpportunity(scope, fact())).rejects.toBeInstanceOf(ValidationError);
    expect(listAccounts).toHaveBeenCalledTimes(1);
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it.each([
    ['NaN', NaN],
    ['non-finite', Infinity],
    ['zero', 0],
    ['negative', -10],
    ['above MAX_CENTS', (MAX_CENTS + 1) / 100],
  ])('rejects bad money (%s) with ValidationError, never creating', async (_k, amount) => {
    const { bridge, createReceivable } = buildBridge();

    await expect(bridge.bookWonOpportunity(scope, fact({ amount }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(createReceivable).not.toHaveBeenCalled();
  });

  it('L1: an already-booked opportunity with corrupted money classifies as booked instead of failing', async () => {
    const { bridge } = buildBridge({
      findAllByDocumentNumber: jest.fn(async () => [row({ id: 'recv-existing' })]),
    });

    await expect(bridge.bookWonOpportunity(scope, fact({ amount: NaN }))).resolves.toEqual({
      outcome: 'already_booked',
    });
  });

  it('rejects a calendar-invalid closedAt (2026-02-30 rolls over in Date — slice+round-trip catches it)', async () => {
    const { bridge, createReceivable } = buildBridge();

    await expect(
      bridge.bookWonOpportunity(scope, fact({ occurredAt: '2026-02-30T10:00:00.000Z' })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createReceivable).not.toHaveBeenCalled();
  });
});
