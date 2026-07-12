/**
 * auditCanonical — pure canonicalization functions, tested in isolation.
 * No Prisma, no tx, no side effects.
 */
import {
  canonicalizeAuditPayload,
  buildAuditCanonicalTuple,
  hashAuditCanonical,
  GENESIS_HASH,
  AuditTupleInput,
} from '../auditCanonical';

describe('canonicalizeAuditPayload', () => {
  it('keeps only allowlisted keys for entry.posted', () => {
    const result = canonicalizeAuditPayload('entry.posted', {
      sourceType: 'manual',
      description: 'Venda',
      sumDebitCents: '10000',
      lineCount: '2',
      password: 'secret',    // must be dropped
      requestBody: '{}',     // must be dropped
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      description: 'Venda',
      lineCount: '2',
      sourceType: 'manual',
      sumDebitCents: '10000',
    });
    expect(parsed).not.toHaveProperty('password');
    expect(parsed).not.toHaveProperty('requestBody');
  });

  it('keeps only allowlisted keys for entry.reversed', () => {
    const result = canonicalizeAuditPayload('entry.reversed', {
      originalId: 'entry-1',
      reversalId: 'rev-1',
      reason: 'erro',
      token: 'abc',
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ originalId: 'entry-1', reason: 'erro', reversalId: 'rev-1' });
    expect(parsed).not.toHaveProperty('token');
  });

  it('converts BigInt to string', () => {
    const result = canonicalizeAuditPayload('entry.posted', {
      sourceType: 'manual',
      description: 'Test',
      sumDebitCents: BigInt(5000),
      lineCount: '2',
    });
    const parsed = JSON.parse(result);
    expect(typeof parsed.sumDebitCents).toBe('string');
    expect(parsed.sumDebitCents).toBe('5000');
  });

  it('omits undefined and null values', () => {
    const result = canonicalizeAuditPayload('entry.reversed', {
      originalId: 'entry-1',
      reversalId: 'rev-1',
      reason: undefined,
    });
    const parsed = JSON.parse(result);
    expect(parsed).not.toHaveProperty('reason');
    expect(parsed).toHaveProperty('originalId');
  });

  it('produces stable key order (sorted)', () => {
    const r1 = canonicalizeAuditPayload('entry.reversed', { reversalId: 'r1', originalId: 'e1' });
    const r2 = canonicalizeAuditPayload('entry.reversed', { originalId: 'e1', reversalId: 'r1' });
    expect(r1).toBe(r2);
    // First key must be originalId (alphabetically before reversalId)
    expect(Object.keys(JSON.parse(r1))[0]).toBe('originalId');
  });

  it('throws for unknown eventType', () => {
    expect(() => canonicalizeAuditPayload('unknown.event', {})).toThrow();
  });

  it('handles period.soft_closed with all fields', () => {
    const result = canonicalizeAuditPayload('period.soft_closed', {
      year: 2026,
      month: 6,
      fromStatus: 'OPEN',
      toStatus: 'SOFT_CLOSED',
      reason: 'Fim do mês',
    });
    const parsed = JSON.parse(result);
    expect(parsed.year).toBe('2026');
    expect(parsed.month).toBe('6');
    expect(parsed.fromStatus).toBe('OPEN');
    expect(parsed.reason).toBe('Fim do mês');
  });

  // BE-INCR-9 / 9B — referential mapping events must be allowlisted so the in-tx audit
  // (ACC-019) of set/batch/copy/unset survives canonicalization instead of throwing
  // "unknown eventType" and rolling back the write. Keys mirror the service payloads.
  it('keeps only allowlisted keys for referential.mapping.set (batch/copy reuse this event)', () => {
    const result = canonicalizeAuditPayload('referential.mapping.set', {
      accountId: 'acc-cash',
      referentialCode: '1.01.01',
      mappingVersion: '2025',
      // non-allowlisted provenance/PII must be dropped
      label: 'Caixa (referencial)',
      secret: 'drop-me',
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      accountId: 'acc-cash',
      referentialCode: '1.01.01',
      mappingVersion: '2025',
    });
  });

  it('keeps only allowlisted keys for referential.mapping.unset', () => {
    const result = canonicalizeAuditPayload('referential.mapping.unset', {
      accountId: 'acc-cash',
      referentialCode: '1.01.01',
      mappingVersion: '2025',
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      accountId: 'acc-cash',
      referentialCode: '1.01.01',
      mappingVersion: '2025',
    });
  });
});

describe('buildAuditCanonicalTuple + hashAuditCanonical', () => {
  const baseInput: AuditTupleInput = {
    eventId:          'evt-1',
    scopeUserId:      'u1',
    unitId:           'unit-1',
    seq:              1n,
    actorUserId:      'u1',
    actorType:        'USER',
    eventType:        'entry.posted',
    targetType:       'journal_entry',
    targetId:         'entry-1',
    payloadCanonical: '{"description":"Test","lineCount":"2","sourceType":"manual","sumDebitCents":"10000"}',
    createdAtISO:     '2026-06-27T14:00:00.000Z',
    prevHash:         GENESIS_HASH,
  };

  it('produces a deterministic hash for the same input', () => {
    const tuple1 = buildAuditCanonicalTuple(baseInput);
    const tuple2 = buildAuditCanonicalTuple(baseInput);
    expect(hashAuditCanonical(tuple1)).toBe(hashAuditCanonical(tuple2));
  });

  it('hash changes when any field changes', () => {
    const tuple = buildAuditCanonicalTuple(baseInput);
    const hash1 = hashAuditCanonical(tuple);

    const tupleModified = buildAuditCanonicalTuple({ ...baseInput, targetId: 'entry-2' });
    const hash2 = hashAuditCanonical(tupleModified);

    expect(hash1).not.toBe(hash2);
  });

  it('tuple string includes "audit.v1" version marker', () => {
    const tuple = buildAuditCanonicalTuple(baseInput);
    expect(tuple).toContain('"audit.v1"');
  });

  it('seq is serialized as string inside the tuple (not BigInt)', () => {
    const tuple = buildAuditCanonicalTuple(baseInput);
    const parsed = JSON.parse(tuple);
    expect(typeof parsed.seq).toBe('string');
    expect(parsed.seq).toBe('1');
  });

  it('prevHash is included inside the tuple (not concatenated outside)', () => {
    const tuple = buildAuditCanonicalTuple(baseInput);
    expect(tuple).toContain(GENESIS_HASH);
  });

  it('hash is 64 hex chars (sha256)', () => {
    const tuple = buildAuditCanonicalTuple(baseInput);
    const hash = hashAuditCanonical(tuple);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('genesis hash is 64 zeroes', () => {
    expect(GENESIS_HASH).toHaveLength(64);
    expect(GENESIS_HASH).toMatch(/^0{64}$/);
  });
});
