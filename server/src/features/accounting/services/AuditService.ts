import { randomUUID } from 'crypto';
import type { Prisma } from 'generated/prisma';
import type { IAuditRepository } from '../repositories/IAuditRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { AccountingScope } from '../scope/AccountingScope';
import {
  GENESIS_HASH,
  HASH_VERSION,
  CANONICAL_VERSION,
  buildAuditCanonicalTuple,
  canonicalizeAuditPayload,
  hashAuditCanonical,
} from '../audit/auditCanonical';

export type VerifyFailureReason =
  | 'MISSING_GENESIS'
  | 'SEQ_GAP'
  | 'PREV_HASH_MISMATCH'
  | 'HASH_MISMATCH'
  | 'HEAD_MISMATCH';

export interface VerifyResult {
  ok:            boolean;
  checkedEvents: number;
  firstSeq:      bigint | null;
  lastSeq:       bigint | null;
  headHash:      string | null;
  failure?: { seq: bigint; reason: VerifyFailureReason };
}

export interface AuditEventInput {
  actorUserId: string | null;
  actorType?:  string;
  eventType:   string;
  targetType:  string;
  targetId:    string;
  payload:     Record<string, unknown>;
}

export class AuditService {
  constructor(
    private readonly auditRepo: IAuditRepository,
    private readonly postingRepo: IPostingRepository,
  ) {}

  /**
   * Append one audit event in the same tx as the originating mutation.
   * tx is REQUIRED — append outside a tx is prohibited (Q10).
   * P2002 on seq/hash is NEVER swallowed — propagates to rollback the outer tx.
   */
  async append(
    tx: Prisma.TransactionClient,
    scope: AccountingScope,
    input: AuditEventInput,
  ): Promise<void> {
    const head = await this.auditRepo.getOrCreateHead(scope, tx);

    const eventId      = randomUUID();
    const seq          = head.nextSeq;
    const prevHash     = head.headHash;
    const createdAt    = new Date();
    const createdAtISO = createdAt.toISOString();
    const actorType    = input.actorType ?? 'USER';

    const payloadCanonical = canonicalizeAuditPayload(input.eventType, input.payload);

    const tupleJson = buildAuditCanonicalTuple({
      eventId,
      scopeUserId:  scope.ownerUserId,
      unitId:       scope.unitId,
      seq,
      actorUserId:  input.actorUserId,
      actorType,
      eventType:    input.eventType,
      targetType:   input.targetType,
      targetId:     input.targetId,
      payloadCanonical,
      createdAtISO,
      prevHash,
    });

    const hash = hashAuditCanonical(tupleJson);

    // Both INSERT and bumpHead must succeed in the same tx; P2002 → throw → outer rollback.
    await this.auditRepo.append(
      {
        id:               eventId,
        scopeUserId:      scope.ownerUserId,
        unitId:           scope.unitId,
        seq,
        actorUserId:      input.actorUserId,
        actorType,
        eventType:        input.eventType,
        targetType:       input.targetType,
        targetId:         input.targetId,
        payload:          payloadCanonical,
        prevHash,
        hash,
        hashVersion:      HASH_VERSION,
        canonicalVersion: CANONICAL_VERSION,
        createdAt,
      },
      tx,
    );

    await this.auditRepo.bumpHead(scope, seq + 1n, hash, head.version, tx);
  }

  /**
   * Verify the full audit chain for this scope.
   * Diagnostic only — does NOT repair the chain.
   */
  async verifyAuditChain(scope: AccountingScope): Promise<VerifyResult> {
    const events = await this.auditRepo.listByScope(scope);

    if (events.length === 0) {
      return { ok: true, checkedEvents: 0, firstSeq: null, lastSeq: null, headHash: null };
    }

    // 1. Genesis must start at seq=1.
    if (events[0].seq !== 1n) {
      return {
        ok: false, checkedEvents: 0,
        firstSeq: events[0].seq, lastSeq: null, headHash: null,
        failure: { seq: events[0].seq, reason: 'MISSING_GENESIS' },
      };
    }

    // 2. prevHash of seq=1 must be GENESIS_HASH.
    if (events[0].prevHash !== GENESIS_HASH) {
      return {
        ok: false, checkedEvents: 1,
        firstSeq: 1n, lastSeq: events[0].seq, headHash: null,
        failure: { seq: 1n, reason: 'PREV_HASH_MISMATCH' },
      };
    }

    let prevHash = GENESIS_HASH;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];

      // 3. No seq gaps.
      if (ev.seq !== BigInt(i + 1)) {
        return {
          ok: false, checkedEvents: i,
          firstSeq: 1n, lastSeq: events[i - 1]?.seq ?? null, headHash: null,
          failure: { seq: ev.seq, reason: 'SEQ_GAP' },
        };
      }

      // 4. prevHash chain continuity.
      if (ev.prevHash !== prevHash) {
        return {
          ok: false, checkedEvents: i,
          firstSeq: 1n, lastSeq: events[i - 1]?.seq ?? null, headHash: null,
          failure: { seq: ev.seq, reason: 'PREV_HASH_MISMATCH' },
        };
      }

      // 5. Recompute and verify hash.
      const tupleJson = buildAuditCanonicalTuple({
        eventId:          ev.id,
        scopeUserId:      ev.scopeUserId,
        unitId:           ev.unitId,
        seq:              ev.seq,
        actorUserId:      ev.actorUserId,
        actorType:        ev.actorType,
        eventType:        ev.eventType,
        targetType:       ev.targetType,
        targetId:         ev.targetId,
        payloadCanonical: ev.payload,
        createdAtISO:     ev.createdAt.toISOString(),
        prevHash:         ev.prevHash,
      });
      const recomputedHash = hashAuditCanonical(tupleJson);
      if (recomputedHash !== ev.hash) {
        return {
          ok: false, checkedEvents: i,
          firstSeq: 1n, lastSeq: ev.seq, headHash: null,
          failure: { seq: ev.seq, reason: 'HASH_MISMATCH' },
        };
      }

      prevHash = ev.hash;
    }

    // 6. Head must match last event.
    const lastEvent = events[events.length - 1];
    const headHash = lastEvent.hash;
    const expectedNextSeq = lastEvent.seq + 1n;

    const headCheck = await this.postingRepo.runTransaction(async (tx) => {
      return this.auditRepo.getOrCreateHead(scope, tx);
    });

    if (headCheck.headHash !== headHash || headCheck.nextSeq !== expectedNextSeq) {
      return {
        ok: false, checkedEvents: events.length,
        firstSeq: 1n, lastSeq: lastEvent.seq, headHash: headCheck.headHash,
        failure: { seq: lastEvent.seq, reason: 'HEAD_MISMATCH' },
      };
    }

    return {
      ok:            true,
      checkedEvents: events.length,
      firstSeq:      1n,
      lastSeq:       lastEvent.seq,
      headHash:      lastEvent.hash,
    };
  }
}
