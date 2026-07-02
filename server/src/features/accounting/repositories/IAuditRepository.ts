import type { AuditChainHead, AuditEvent, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

export interface AppendAuditInput {
  id:               string;
  scopeUserId:      string;
  unitId:           string;
  seq:              bigint;
  actorUserId:      string | null;
  actorType:        string;
  eventType:        string;
  targetType:       string;
  targetId:         string;
  payload:          string;
  prevHash:         string;
  hash:             string;
  hashVersion:      number;
  canonicalVersion: number;
  createdAt:        Date;
}

export interface IAuditRepository {
  /** Insert one immutable audit event. tx is REQUIRED — append outside a tx is prohibited. */
  append(input: AppendAuditInput, tx: Prisma.TransactionClient): Promise<AuditEvent>;

  /** Read or initialize the chain head for this scope (inside tx, for locking). */
  getOrCreateHead(scope: AccountingScope, tx: Prisma.TransactionClient): Promise<AuditChainHead>;

  /** Advance the head with optimistic lock on version. Throws on version mismatch. */
  bumpHead(
    scope: AccountingScope,
    nextSeq: bigint,
    headHash: string,
    currentVersion: number,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /** Read all events for scope ordered by seq asc (for verify). */
  listByScope(scope: AccountingScope): Promise<AuditEvent[]>;

  /** Read events for a specific target. */
  listByTarget(scope: AccountingScope, targetType: string, targetId: string): Promise<AuditEvent[]>;
}
