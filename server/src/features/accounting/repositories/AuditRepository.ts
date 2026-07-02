import type { AuditChainHead, AuditEvent, Prisma } from 'generated/prisma';
import prisma from '../../../lib/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { GENESIS_HASH } from '../audit/auditCanonical';
import type { AppendAuditInput, IAuditRepository } from './IAuditRepository';

export class AuditRepository implements IAuditRepository {
  async append(input: AppendAuditInput, tx: Prisma.TransactionClient): Promise<AuditEvent> {
    return tx.auditEvent.create({ data: input });
  }

  async getOrCreateHead(
    scope: AccountingScope,
    tx: Prisma.TransactionClient,
  ): Promise<AuditChainHead> {
    const existing = await tx.auditChainHead.findUnique({
      where: { scopeUserId_unitId: { scopeUserId: scope.ownerUserId, unitId: scope.unitId } },
    });
    if (existing) return existing;

    // Genesis: first event for this scope.
    return tx.auditChainHead.create({
      data: {
        scopeUserId: scope.ownerUserId,
        unitId:      scope.unitId,
        nextSeq:     1n,
        headHash:    GENESIS_HASH,
        version:     0,
      },
    });
  }

  async bumpHead(
    scope: AccountingScope,
    nextSeq: bigint,
    headHash: string,
    currentVersion: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const result = await tx.auditChainHead.updateMany({
      where: {
        scopeUserId: scope.ownerUserId,
        unitId:      scope.unitId,
        version:     currentVersion,
      },
      data: {
        nextSeq,
        headHash,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      // Optimistic lock failed — concurrent append won the race. P2002 in seq catches this too,
      // but bumpHead 0-rows is the first signal in a serialized-tx scenario.
      throw new Error('[audit] bumpHead optimistic lock failed — concurrent append detected');
    }
  }

  async listByScope(scope: AccountingScope): Promise<AuditEvent[]> {
    return prisma.auditEvent.findMany({
      where: { scopeUserId: scope.ownerUserId, unitId: scope.unitId },
      orderBy: { seq: 'asc' },
    });
  }

  async listByTarget(
    scope: AccountingScope,
    targetType: string,
    targetId: string,
  ): Promise<AuditEvent[]> {
    return prisma.auditEvent.findMany({
      where: { scopeUserId: scope.ownerUserId, unitId: scope.unitId, targetType, targetId },
      orderBy: { seq: 'asc' },
    });
  }
}
