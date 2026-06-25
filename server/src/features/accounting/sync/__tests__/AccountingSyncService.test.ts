import { Prisma } from 'generated/prisma';
import { AccountingSyncService } from '../AccountingSyncService';
import { CrmOpportunityWonMapper } from '../mappers/CrmOpportunityWonMapper';
import { ValidationError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { PostEntryInput } from '../../dtos/PostingDto';

/** Typed postEntry stub so mock.calls is a [scope, input] tuple (not []). */
const okEntry = (_s: AccountingScope, _i: PostEntryInput) => Promise.resolve({ id: 'entry-1' });

jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

const wonEvent: AccountingEvent = {
  sourceType: 'crm.opportunity.won',
  sourceId: 'opp-1',
  unitId: 'unit-1',
  amount: 1000,
  currency: 'BRL',
  occurredAt: '2026-06-25T00:00:00.000Z',
  label: 'Deal',
};

function p2024(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('timed out fetching connection', {
    code: 'P2024',
    clientVersion: 'test',
  });
}

function buildService(postEntry: jest.Mock) {
  const postingService = { postEntry } as unknown as ConstructorParameters<typeof AccountingSyncService>[0];
  // retryDelayMs:0 keeps the retry tests instant.
  const svc = new AccountingSyncService(postingService, [new CrmOpportunityWonMapper()], {
    maxAttempts: 3,
    retryDelayMs: 0,
  });
  return { svc, postEntry };
}

describe('AccountingSyncService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delegates to PostingService.postEntry with the correct sourceType/sourceId and returns the entry id', async () => {
    const postEntry = jest.fn(okEntry);
    const { svc } = buildService(postEntry);

    const result = await svc.sync(scope, wonEvent);

    expect(result).toEqual({ entryId: 'entry-1' });
    expect(postEntry).toHaveBeenCalledTimes(1);
    const [passedScope, input] = postEntry.mock.calls[0]!;
    expect(passedScope).toBe(scope); // scope passed through UNCHANGED (no unit substitution)
    expect(input).toMatchObject({
      sourceType: 'crm.opportunity.won',
      sourceId: 'opp-1',
      unitId: 'unit-1',
    });
  });

  it('duplicidade: two executions of the same event do not create duplication (same source keys, idempotency owned by postEntry)', async () => {
    // postEntry is the idempotency authority: a 2nd call for the same source returns the same entry.
    const postEntry = jest.fn(okEntry);
    const { svc } = buildService(postEntry);

    const a = await svc.sync(scope, wonEvent);
    const b = await svc.sync(scope, wonEvent);

    expect(a).toEqual(b);
    // service adds NO dedup state of its own — both calls go to postEntry with identical source keys.
    expect(postEntry).toHaveBeenCalledTimes(2);
    expect(postEntry.mock.calls[0]![1].sourceId).toBe(postEntry.mock.calls[1]![1].sourceId);
  });

  it('concorrência/P2002: postEntry race-closes to the existing entry; sync returns it without error', async () => {
    // PostingService catches P2002 internally and returns the existing entry — from the
    // service's view postEntry just resolves with an entry; assert no error surfaces.
    const postEntry = jest.fn(async () => ({ id: 'entry-existing' }));
    const { svc } = buildService(postEntry);

    await expect(svc.sync(scope, wonEvent)).resolves.toEqual({ entryId: 'entry-existing' });
  });

  it('ValidationError is NOT retried (deterministic fault)', async () => {
    const postEntry = jest.fn(async () => {
      throw new ValidationError('Lançamento desbalanceado');
    });
    const { svc } = buildService(postEntry);

    await expect(svc.sync(scope, wonEvent)).rejects.toBeInstanceOf(ValidationError);
    expect(postEntry).toHaveBeenCalledTimes(1); // no retry
  });

  it('transient DB error respects the retry limit then reports without partial write', async () => {
    const postEntry = jest.fn(async () => {
      throw p2024();
    });
    const { svc } = buildService(postEntry);

    await expect(svc.sync(scope, wonEvent)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(postEntry).toHaveBeenCalledTimes(3); // maxAttempts — each attempt is atomic, no partial state
  });

  it('retries a transient error then succeeds', async () => {
    const postEntry = jest
      .fn()
      .mockRejectedValueOnce(p2024())
      .mockResolvedValueOnce({ id: 'entry-2' });
    const { svc } = buildService(postEntry as jest.Mock);

    await expect(svc.sync(scope, wonEvent)).resolves.toEqual({ entryId: 'entry-2' });
    expect(postEntry).toHaveBeenCalledTimes(2);
  });

  it('evento inválido: unknown sourceType (no mapper) is rejected WITHOUT calling postEntry', async () => {
    const postEntry = jest.fn();
    const { svc } = buildService(postEntry);
    const unknownEvent = { ...wonEvent, sourceType: 'crm.unknown.kind' } as unknown as AccountingEvent;

    await expect(svc.sync(scope, unknownEvent)).rejects.toBeInstanceOf(ValidationError);
    expect(postEntry).not.toHaveBeenCalled();
  });

  it('unitId is never substituted or crossed — the posting input carries the event unit', async () => {
    const postEntry = jest.fn((_s: AccountingScope, _i: PostEntryInput) => Promise.resolve({ id: 'entry-3' }));
    const { svc } = buildService(postEntry);
    const otherUnitScope: AccountingScope = { ...scope, unitId: 'unit-9' };

    await svc.sync(otherUnitScope, { ...wonEvent, unitId: 'unit-9' });

    const [passedScope, input] = postEntry.mock.calls[0]!;
    expect(passedScope.unitId).toBe('unit-9');
    expect(input.unitId).toBe('unit-9');
  });
});
