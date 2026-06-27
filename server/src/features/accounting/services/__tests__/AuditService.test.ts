/**
 * AuditService — append-only hash-chain audit trail.
 *
 * Tests use mock IAuditRepository + IPostingRepository (runTransaction stub).
 * No Prisma, no SQLite. The hash-chain math is exercised via the real
 * auditCanonical helpers (not mocked) — mutations to those functions will
 * break these tests, which is exactly what we want.
 *
 * Covered:
 *  (a) genesis: seq=1, prevHash=GENESIS_HASH
 *  (b) chaining: seq=2, prevHash=hash(seq=1)
 *  (c) verify chain intact → ok
 *  (d) verify: payload altered → HASH_MISMATCH
 *  (e) verify: prevHash altered → PREV_HASH_MISMATCH
 *  (f) verify: seq gap → SEQ_GAP
 *  (g) verify: head divergent → HEAD_MISMATCH
 *  (h) verify: empty chain → ok (0 events)
 *  (i) P2002 in append propagates (not swallowed)
 *  (j) bumpHead optimistic lock failure propagates
 *  (k) payload with forbidden field excluded from canonical
 *  (l) BigInt in payload converted to string
 */
import { AuditService } from '../AuditService';
import { GENESIS_HASH, hashAuditCanonical, buildAuditCanonicalTuple } from '../../audit/auditCanonical';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { AuditEvent, AuditChainHead } from 'generated/prisma';

jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const scope: AccountingScope = {
  ownerUserId:      'u1',
  actorUserId:      'u1',
  unitId:           'unit-1',
  ledgerCode:       'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone:         'America/Sao_Paulo',
};

// Fake AuditChainHead state — starts at genesis.
function makeHead(nextSeq: bigint, headHash: string, version: number): AuditChainHead {
  return { scopeUserId: 'u1', unitId: 'unit-1', nextSeq, headHash, version, updatedAt: new Date() };
}

function makeEvent(overrides: Partial<AuditEvent> & { seq: bigint; hash: string; prevHash: string }): AuditEvent {
  return {
    id:               'evt-' + overrides.seq,
    scopeUserId:      'u1',
    unitId:           'unit-1',
    actorUserId:      'u1',
    actorType:        'USER',
    eventType:        'entry.posted',
    targetType:       'journal_entry',
    targetId:         'entry-1',
    payload:          '{"description":"Test","lineCount":"2","sourceType":"manual","sumDebitCents":"10000"}',
    hashVersion:      1,
    canonicalVersion: 1,
    createdAt:        new Date('2026-06-27T14:00:00.000Z'),
    ...overrides,
  } as AuditEvent;
}

// Build a real event chain (seq=1 to N) for verify tests.
function buildChain(n: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prevHash = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const seq = BigInt(i);
    const id = `evt-${i}`;
    const createdAt = new Date('2026-06-27T14:00:00.000Z');
    const payload = '{"description":"Test","lineCount":"2","sourceType":"manual","sumDebitCents":"10000"}';
    const tupleJson = buildAuditCanonicalTuple({
      eventId:          id,
      scopeUserId:      'u1',
      unitId:           'unit-1',
      seq,
      actorUserId:      'u1',
      actorType:        'USER',
      eventType:        'entry.posted',
      targetType:       'journal_entry',
      targetId:         'entry-1',
      payloadCanonical: payload,
      createdAtISO:     createdAt.toISOString(),
      prevHash,
    });
    const hash = hashAuditCanonical(tupleJson);
    events.push(makeEvent({ seq, hash, prevHash, id, createdAt, payload }));
    prevHash = hash;
  }
  return events;
}

function buildService(headState: AuditChainHead | null, events: AuditEvent[]) {
  let head = headState;

  const auditRepo = {
    append:         jest.fn(async (input: any) => ({ ...input } as AuditEvent)),
    getOrCreateHead: jest.fn(async () => head ?? makeHead(1n, GENESIS_HASH, 0)),
    bumpHead:       jest.fn(async (_scope: any, nextSeq: bigint, headHash: string, _ver: number) => {
      head = makeHead(nextSeq, headHash, (head?.version ?? 0) + 1);
    }),
    listByScope:    jest.fn(async () => events),
    listByTarget:   jest.fn(async () => events),
  };

  const postingRepo = {
    runTransaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };

  const svc = new AuditService(auditRepo as any, postingRepo as any);
  return { svc, auditRepo, postingRepo };
}

const baseAppendInput = {
  actorUserId: 'u1' as string | null,
  eventType:   'entry.posted',
  targetType:  'journal_entry',
  targetId:    'entry-1',
  payload:     {
    sourceType:    'manual',
    description:   'Venda',
    sumDebitCents: '10000',
    lineCount:     '2',
  },
};

describe('AuditService.append', () => {
  it('genesis: first event has seq=1 and prevHash=GENESIS_HASH', async () => {
    const { svc, auditRepo } = buildService(null, []);
    await svc.append({} as any, scope, baseAppendInput);

    const call = auditRepo.append.mock.calls[0][0];
    expect(call.seq).toBe(1n);
    expect(call.prevHash).toBe(GENESIS_HASH);
    expect(call.scopeUserId).toBe('u1');
    expect(call.unitId).toBe('unit-1');
  });

  it('chaining: second append has prevHash = hash of first', async () => {
    const { svc, auditRepo } = buildService(null, []);
    await svc.append({} as any, scope, baseAppendInput);
    const firstHash = auditRepo.append.mock.calls[0][0].hash;

    await svc.append({} as any, scope, { ...baseAppendInput, targetId: 'entry-2' });
    const secondCall = auditRepo.append.mock.calls[1][0];
    expect(secondCall.seq).toBe(2n);
    expect(secondCall.prevHash).toBe(firstHash);
  });

  it('bumpHead is called with seq+1 and the new hash', async () => {
    const { svc, auditRepo } = buildService(null, []);
    await svc.append({} as any, scope, baseAppendInput);

    const appendedHash = auditRepo.append.mock.calls[0][0].hash;
    const bumpCall = auditRepo.bumpHead.mock.calls[0];
    expect(bumpCall[1]).toBe(2n);           // nextSeq
    expect(bumpCall[2]).toBe(appendedHash); // headHash
  });

  it('P2002 from auditRepo.append propagates (not swallowed)', async () => {
    const { svc, auditRepo } = buildService(null, []);
    const p2002 = Object.assign(new Error('P2002'), { code: 'P2002' });
    auditRepo.append.mockRejectedValueOnce(p2002);
    await expect(svc.append({} as any, scope, baseAppendInput)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('bumpHead failure propagates (not swallowed)', async () => {
    const { svc, auditRepo } = buildService(null, []);
    auditRepo.bumpHead.mockRejectedValueOnce(new Error('[audit] bumpHead optimistic lock failed'));
    await expect(svc.append({} as any, scope, baseAppendInput)).rejects.toThrow('bumpHead');
  });

  it('payload forbidden field (password) is excluded from canonical', async () => {
    const { svc, auditRepo } = buildService(null, []);
    await svc.append({} as any, scope, {
      ...baseAppendInput,
      payload: { ...baseAppendInput.payload, password: 'secret' },
    });
    const stored = auditRepo.append.mock.calls[0][0].payload;
    expect(stored).not.toContain('password');
    expect(stored).not.toContain('secret');
  });

  it('BigInt in payload is converted to string in canonical', async () => {
    const { svc, auditRepo } = buildService(null, []);
    await svc.append({} as any, scope, {
      ...baseAppendInput,
      payload: { ...baseAppendInput.payload, sumDebitCents: BigInt(10000) },
    });
    const stored = auditRepo.append.mock.calls[0][0].payload;
    const parsed = JSON.parse(stored);
    expect(typeof parsed.sumDebitCents).toBe('string');
    expect(parsed.sumDebitCents).toBe('10000');
  });

  it('createdAt is set by the app (not undefined) and is a Date', async () => {
    const { svc, auditRepo } = buildService(null, []);
    await svc.append({} as any, scope, baseAppendInput);
    const { createdAt } = auditRepo.append.mock.calls[0][0];
    expect(createdAt).toBeInstanceOf(Date);
    expect(isNaN(createdAt.getTime())).toBe(false);
  });
});

describe('AuditService.verifyAuditChain', () => {
  it('empty chain → ok with 0 events', async () => {
    const { svc } = buildService(makeHead(1n, GENESIS_HASH, 0), []);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(true);
    expect(result.checkedEvents).toBe(0);
  });

  it('intact chain of 2 events → ok', async () => {
    const events = buildChain(2);
    const head = makeHead(3n, events[1].hash, 2);
    const { svc } = buildService(head, events);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(true);
    expect(result.checkedEvents).toBe(2);
    expect(result.firstSeq).toBe(1n);
    expect(result.lastSeq).toBe(2n);
  });

  it('first event seq !== 1 → MISSING_GENESIS', async () => {
    const events = buildChain(1).map((e) => ({ ...e, seq: 2n }));
    const head = makeHead(3n, 'anything', 1);
    const { svc } = buildService(head, events);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe('MISSING_GENESIS');
  });

  it('prevHash of seq=1 ≠ GENESIS_HASH → PREV_HASH_MISMATCH', async () => {
    const events = buildChain(1).map((e) => ({ ...e, prevHash: 'bad' }));
    const head = makeHead(2n, 'anything', 1);
    const { svc } = buildService(head, events);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe('PREV_HASH_MISMATCH');
  });

  it('payload altered → HASH_MISMATCH', async () => {
    const events = buildChain(1).map((e) => ({ ...e, payload: '{"tampered":"yes"}' }));
    const head = makeHead(2n, events[0].hash, 1);
    const { svc } = buildService(head, events);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe('HASH_MISMATCH');
  });

  it('seq gap (missing seq=2) → SEQ_GAP', async () => {
    const events = buildChain(3);
    const withGap = [events[0], events[2]]; // skip seq=2
    const head = makeHead(4n, events[2].hash, 3);
    const { svc } = buildService(head, withGap);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe('SEQ_GAP');
  });

  it('head hash mismatch → HEAD_MISMATCH', async () => {
    const events = buildChain(2);
    const head = makeHead(3n, 'wrong-hash', 2); // head disagrees with last event
    const { svc } = buildService(head, events);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe('HEAD_MISMATCH');
  });

  it('head nextSeq mismatch → HEAD_MISMATCH', async () => {
    const events = buildChain(2);
    const head = makeHead(99n, events[1].hash, 2); // hash ok but nextSeq wrong
    const { svc } = buildService(head, events);
    const result = await svc.verifyAuditChain(scope);
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe('HEAD_MISMATCH');
  });
});
