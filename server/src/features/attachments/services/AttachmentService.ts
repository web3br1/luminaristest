import type { CrmAttachment } from 'generated/prisma';
import type { IUser } from '../../users/models/User.model';
import { Role } from '../../users/models/User.model';
import type { IAttachmentRepository } from '../repositories/IAttachmentRepository';
import type { IAttachmentPolicy } from '../policies/IAttachmentPolicy';
import type { AttachmentEntityType } from '../models/Attachment.model';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../../lib/errors';
import * as storage from '../../../lib/attachmentStorage';

/** Input for an upload — file metadata + buffer are derived server-side in the controller. */
export interface UploadAttachmentInput {
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

/** Result of getForDownload — metadata row + resolved absolute path for streaming. */
export interface DownloadTarget {
  meta: CrmAttachment;
  absPath: string;
}

/**
 * Client-safe view of an attachment row. Deliberately omits storageKey (leaks the
 * on-disk layout) and userId (leaks tenant identity) — those stay server-side.
 */
export interface AttachmentResponse {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Business logic for CRM attachments. Orchestrates the disk store (attachmentStorage)
 * and the metadata repository. No prisma.* and no Express here. Cross-tenant access
 * surfaces as NotFoundError (prevents enumeration).
 */
export class AttachmentService {
  constructor(
    private readonly repository: IAttachmentRepository,
    private readonly policy: IAttachmentPolicy,
  ) {}

  /** Maps a stored row to the client-safe response (drops storageKey + userId). */
  private toResponse(att: CrmAttachment): AttachmentResponse {
    return {
      id: att.id,
      entityType: att.entityType,
      entityId: att.entityId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
      createdAt: att.createdAt,
      updatedAt: att.updatedAt,
    };
  }

  /**
   * Saves the binary to disk then persists a metadata row owned by the actor.
   * The storageKey is generated server-side by the storage util.
   */
  public async upload(actor: IUser | null, input: UploadAttachmentInput): Promise<AttachmentResponse> {
    if (!actor) throw new UnauthorizedError('Authentication required to upload attachments');

    const { storageKey, sanitizedName } = await storage.saveFile(
      actor.id,
      input.entityType,
      input.entityId,
      input.fileName,
      input.buffer,
    );

    const created = await this.repository.create({
      userId: actor.id,
      entityType: input.entityType,
      entityId: input.entityId,
      // Persist the sanitized name (what is actually on disk), never the raw client input.
      fileName: sanitizedName,
      mimeType: input.mimeType,
      fileSize: input.buffer.length,
      storageKey,
    });

    return this.toResponse(created);
  }

  /**
   * Lists active attachments for a parent record, scoped to the actor (tenant isolation).
   */
  public async listByEntity(
    actor: IUser | null,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<AttachmentResponse[]> {
    if (!actor) throw new UnauthorizedError('Authentication required to list attachments');
    const rows = await this.repository.findManyByEntity(actor.id, entityType, entityId);
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Resolves the metadata + absolute path for download. Missing or cross-tenant
   * attachments are reported as NotFoundError.
   */
  public async getForDownload(actor: IUser | null, id: string): Promise<DownloadTarget> {
    if (!actor) throw new UnauthorizedError('Authentication required to download attachments');

    const att = await this.repository.findById(id);
    if (!att || (att.userId !== actor.id && actor.role !== Role.ADMIN)) {
      throw new NotFoundError('Attachment not found');
    }

    return { meta: att, absPath: storage.resolveReadPath(att.storageKey) };
  }

  /**
   * Soft-deletes an attachment and best-effort removes its binary from disk.
   * Cross-tenant access is reported as NotFoundError.
   */
  public async delete(actor: IUser | null, id: string): Promise<void> {
    if (!actor) throw new UnauthorizedError('Authentication required to delete attachments');

    const att = await this.repository.findById(id);
    if (!att || (att.userId !== actor.id && actor.role !== Role.ADMIN)) {
      throw new NotFoundError('Attachment not found');
    }

    if (!this.policy.canDelete(actor, att.userId)) {
      throw new ForbiddenError('You are not authorized to delete this attachment');
    }

    await this.repository.softDelete(id);
    await storage.deleteFile(att.storageKey);
  }
}
