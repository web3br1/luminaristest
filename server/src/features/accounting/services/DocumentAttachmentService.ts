import { createHash } from 'node:crypto';
import type { DocumentAttachment } from 'generated/prisma';
import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import * as storage from '../../../lib/attachmentStorage';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IDocumentAttachmentRepository } from '../repositories/IDocumentAttachmentRepository';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { AuditService } from './AuditService';
import type { DocumentAttachmentTargetType } from '../models/DocumentAttachment.model';

/** Input for an upload — file bytes + metadata are derived server-side in the controller. */
export interface UploadDocumentAttachmentInput {
  targetType: DocumentAttachmentTargetType;
  targetId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

/** Metadata row + resolved absolute path for streaming a download. */
export interface DocumentDownloadTarget {
  meta: DocumentAttachment;
  absPath: string;
}

/**
 * Client-safe view of an attachment row. Omits storageKey (leaks on-disk layout),
 * userId and unitId (leak tenant identity) — those stay server-side.
 */
export interface DocumentAttachmentResponse {
  id: string;
  targetType: string;
  targetId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  uploadedById: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

/**
 * Business logic for accounting document attachments (BE-INCR-5). Orchestrates the
 * reused disk store (lib/attachmentStorage), the metadata repository, and the audit
 * hash-chain (AuditService, in-tx). No prisma.* and no Express here. Cross-tenant
 * access surfaces as NotFoundError (prevents enumeration).
 *
 * Transaction boundaries (TX-001): the binary is written to disk BEFORE the DB tx;
 * metadata insert + audit append commit together; if the tx fails the orphan file is
 * removed as compensation. Soft-delete keeps the binary on disk for audit/compliance.
 */
export class DocumentAttachmentService {
  constructor(
    private readonly repository: IDocumentAttachmentRepository,
    private readonly policy: IAccountingPolicy,
    private readonly audit: AuditService,
    private readonly journalEntryRepo: IJournalEntryRepository,
  ) {}

  private toResponse(att: DocumentAttachment): DocumentAttachmentResponse {
    return {
      id: att.id,
      targetType: att.targetType,
      targetId: att.targetId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
      sha256: att.sha256,
      uploadedById: att.uploadedById,
      createdAt: att.createdAt,
      deletedAt: att.deletedAt,
    };
  }

  /**
   * Uploads documentary evidence to a journal entry. Verifies the target entry is in
   * the actor's scope (the FK proves existence, NOT ownership), hashes the file, writes
   * it to disk, then commits metadata + `attachment.uploaded` audit in one tx.
   */
  public async upload(
    scope: AccountingScope,
    input: UploadDocumentAttachmentInput,
  ): Promise<DocumentAttachmentResponse> {
    if (!this.policy.canManage(scope)) {
      throw new ForbiddenError('Não autorizado a anexar evidências contábeis.');
    }

    // Authoritative target-in-scope gate: the DB FK only proves the entry EXISTS, not
    // that it belongs to this tenant. Reject cross-tenant targets as NotFound.
    const entry = await this.journalEntryRepo.findById(scope, input.targetId);
    if (!entry) {
      throw new NotFoundError('Lançamento não encontrado para anexar evidência.');
    }

    const sha256 = createHash('sha256').update(input.buffer).digest('hex');

    // Write the binary BEFORE the tx. Path segments (userId/unitId/targetId) give
    // tenant isolation on disk; assertInsideBase guards traversal inside saveFile.
    const { storageKey, sanitizedName } = await storage.saveFile(
      scope.ownerUserId,
      scope.unitId,
      input.targetId,
      input.fileName,
      input.buffer,
    );

    try {
      const created = await this.repository.runTransaction(async (tx) => {
        const row = await this.repository.create(
          {
            userId: scope.ownerUserId,
            unitId: scope.unitId,
            targetType: input.targetType,
            targetId: input.targetId,
            fileName: sanitizedName,
            mimeType: input.mimeType,
            fileSize: input.buffer.length,
            sha256,
            storageKey,
            uploadedById: scope.actorUserId,
          },
          tx,
        );

        await this.audit.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'attachment.uploaded',
          targetType: 'document_attachment',
          targetId: row.id,
          payload: {
            journalEntryId: input.targetId,
            mimeType: input.mimeType,
            sizeBytes: String(input.buffer.length),
            sha256,
          },
        });

        return row;
      });

      return this.toResponse(created);
    } catch (e) {
      // TX-001 compensation: DB/audit failed after the file was written — remove the
      // orphan so disk and DB stay consistent. deleteFile is ENOENT-idempotent.
      await storage.deleteFile(storageKey);
      throw e;
    }
  }

  /** Lists active attachments for a journal entry, scoped to the tenant. */
  public async listByTarget(
    scope: AccountingScope,
    targetType: DocumentAttachmentTargetType,
    targetId: string,
  ): Promise<DocumentAttachmentResponse[]> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a listar evidências contábeis.');
    }
    const rows = await this.repository.findManyByTarget(scope, targetType, targetId);
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Resolves metadata + absolute path for download. Missing / cross-tenant attachments
   * surface as NotFoundError. Download audit is feature-flagged (default off — see brief
   * §5): when AUDIT_DOWNLOAD_ATTACHMENTS=true it appends `attachment.downloaded` in a tx.
   */
  public async getForDownload(
    scope: AccountingScope,
    id: string,
  ): Promise<DocumentDownloadTarget> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a baixar evidências contábeis.');
    }
    const att = await this.repository.findById(scope, id);
    if (!att) {
      throw new NotFoundError('Anexo não encontrado.');
    }

    if (process.env.AUDIT_DOWNLOAD_ATTACHMENTS === 'true') {
      await this.repository.runTransaction(async (tx) => {
        await this.audit.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'attachment.downloaded',
          targetType: 'document_attachment',
          targetId: att.id,
          payload: {
            journalEntryId: att.targetId,
            mimeType: att.mimeType,
            sizeBytes: String(att.fileSize),
            sha256: att.sha256,
          },
        });
      });
    }

    return { meta: att, absPath: storage.resolveReadPath(att.storageKey) };
  }

  /**
   * Soft-deletes an attachment and appends `attachment.deleted` in the same tx. The
   * physical binary is intentionally RETAINED on disk for audit/compliance (differs
   * from CRM AttachmentService, which removes the binary). Cross-tenant → NotFoundError.
   */
  public async delete(scope: AccountingScope, id: string): Promise<void> {
    if (!this.policy.canManage(scope)) {
      throw new ForbiddenError('Não autorizado a excluir evidências contábeis.');
    }
    const att = await this.repository.findById(scope, id);
    if (!att) {
      throw new NotFoundError('Anexo não encontrado.');
    }

    await this.repository.runTransaction(async (tx) => {
      await this.repository.softDelete(scope, id, scope.actorUserId, tx);
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'attachment.deleted',
        targetType: 'document_attachment',
        targetId: att.id,
        payload: {
          journalEntryId: att.targetId,
          mimeType: att.mimeType,
          sizeBytes: String(att.fileSize),
          sha256: att.sha256,
          deletedById: scope.actorUserId,
        },
      });
    });
  }
}
