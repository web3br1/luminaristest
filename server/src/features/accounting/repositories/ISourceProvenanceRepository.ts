import type { JournalEntrySource, Prisma, SourceDocument } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Input for creating a SourceDocument (the origin descriptor). */
export interface CreateSourceDocumentInput {
  userId: string;
  unitId: string;
  sourceType: string;
  externalRef?: string | null;
  documentDate?: Date | null;
  description?: string | null;
  attachmentId?: string | null;
  rawJson?: string | null;
  createdById?: string | null;
}

/** Input for linking a journal entry to a source document (N:M structural link). */
export interface CreateJournalEntrySourceInput {
  userId: string;
  unitId: string;
  journalEntryId: string;
  sourceDocumentId: string;
}

/** A link row with its resolved source document eagerly loaded (drill-down read). */
export type JournalEntrySourceWithDocument = JournalEntrySource & {
  sourceDocument: SourceDocument;
};

/**
 * Contract for provenance data access (BE-INCR-8 / ADR-INCR8). First-class Prisma —
 * the ONLY place that touches prisma.sourceDocument / prisma.journalEntrySource.
 * DESCRIPTIVE layer: writes NO ledger value (no Posting/debit/credit/status). Idempotency
 * stays in JournalEntry.@@unique (T7); this repository has no dedup key of its own (D2).
 *
 * Conventions:
 * - Every write accepts a tx handle so the seam composes entry + origin + audit atomically
 *   inside PostingService.postEntry's runTransaction (ACC-011/012, tx propagated — T6).
 * - Every read is scoped via AccountingScope (userId + unitId) — cross-unit reads return []
 *   (the drill-down never leaks another tenant's origins).
 */
export interface ISourceProvenanceRepository {
  /** Persists an origin descriptor (tx-aware). */
  createSourceDocument(
    data: CreateSourceDocumentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<SourceDocument>;

  /** Links an entry to a source document (tx-aware). @@unique([journalEntryId, sourceDocumentId]). */
  linkEntry(
    data: CreateJournalEntrySourceInput,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntrySource>;

  /**
   * Drill-down read: the origin links for an entry within the scope, each with its resolved
   * SourceDocument. Ordered by createdAt for stable display. Empty when the entry has no
   * origin (manual/reversal) or belongs to another tenant.
   */
  findSourcesByEntry(
    scope: AccountingScope,
    journalEntryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntrySourceWithDocument[]>;
}
