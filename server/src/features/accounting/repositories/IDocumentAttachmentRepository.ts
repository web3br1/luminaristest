import type { DocumentAttachment, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import type {
  CreateDocumentAttachmentInput,
  DocumentAttachmentTargetType,
} from '../models/DocumentAttachment.model';

/**
 * Contract for accounting document-attachment data access. First-class Prisma.
 * Every read/mutation is scoped via AccountingScope (userId + unitId). Soft-delete
 * universal — no prisma.delete() (the binary is retained on disk for compliance too).
 * `runTransaction` is exposed here so the service can compose the metadata write and
 * the audit append atomically without importing the prisma singleton (layer boundary).
 */
export interface IDocumentAttachmentRepository {
  /** Persists a new attachment row (tx-aware). */
  create(
    data: CreateDocumentAttachmentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentAttachment>;

  /** Finds an active attachment by id within the scope, or null. */
  findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentAttachment | null>;

  /** Lists active attachments for a target (entry), scoped, newest first. */
  findManyByTarget(
    scope: AccountingScope,
    targetType: DocumentAttachmentTargetType,
    targetId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentAttachment[]>;

  /** Soft-deletes (sets deletedAt + deletedById) within the scope. Throws if not found. */
  softDelete(
    scope: AccountingScope,
    id: string,
    deletedById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /** Runs fn inside a DB transaction (the only tx entry point for the service). */
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
