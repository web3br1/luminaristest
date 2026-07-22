import type { ReferentialAccount } from 'generated/prisma';
import { ForbiddenError, ValidationError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { parseTable, type SpreadsheetFormat } from '../../../lib/spreadsheet';
import {
  parseReferentialCatalog,
  CatalogHeaderError,
  type CatalogRowError,
} from '../../../lib/referentialCatalog';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type {
  IReferentialAccountRepository,
  ReferentialCatalogQuery,
} from '../repositories/IReferentialAccountRepository';

/** Uploaded catalog file surface (a multer memory-storage file). */
export interface UploadedCatalogFile {
  originalname: string;
  buffer: Buffer;
}

/** Summary of a catalog import (idempotent per layoutVersion). */
export interface ReferentialCatalogImportResult {
  layoutVersion: string;
  totalRows: number;
  imported: number;
  analyticCount: number;
  syntheticCount: number;
}

/** XLSX files are ZIP-based (PK magic); everything else is treated as CSV/text. */
function sniffFormat(buffer: Buffer, name: string): SpreadsheetFormat {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';
  if (name.toLowerCase().endsWith('.xlsx')) return 'xlsx';
  return 'csv';
}

/** First few row errors, formatted for a single ValidationError message. */
function summarizeErrors(errors: CatalogRowError[]): string {
  const head = errors
    .slice(0, 5)
    .map((e) => `linha ${e.rowNumber}: ${e.field} — ${e.message}`)
    .join('; ');
  const more = errors.length > 5 ? ` (+${errors.length - 5} outros)` : '';
  return `${errors.length} linha(s) inválida(s) no catálogo: ${head}${more}`;
}

/**
 * ReferentialCatalogService — imports and reads the official RFB referential CATALOG
 * (`referential_accounts`), BE-INCR-9B / ADR-INCR9B Track B. FIRST-CLASS PRISMA.
 *
 * The catalog is GLOBAL reference data (no tenancy — D4): the AccountingScope is used ONLY for
 * authorization (canManage/ReadReferential), never as tenancy of the written rows. Because it is
 * global (no scope), the import is NOT appended to the per-scope audit hash-chain (AuditService is
 * userId+unitId; a global op has no scope — ACC-010) — it is recorded via the operational logger;
 * the idempotent upsert + returned summary are the durable record.
 *
 * D1/I052: this service INVENTS NO code. The catalog content comes entirely from the uploaded
 * file (transcribed from the official layout by a human — the FASE-2 B0 step); `isAnalytic` is
 * READ from a column, never inferred. Import is ALL-OR-NOTHING: a header or any row error rejects
 * the whole file (a partially-imported reference catalog would make destination validation
 * pass/fail arbitrarily). Re-import of the same version upserts in place on @@unique[layoutVersion,
 * code] — idempotent, never P2002.
 */
export class ReferentialCatalogService {
  constructor(
    private readonly repo: IReferentialAccountRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  /** Import the official layout for one version. All-or-nothing; idempotent per version. */
  async import(
    scope: AccountingScope,
    layoutVersion: string,
    file: UploadedCatalogFile,
  ): Promise<ReferentialCatalogImportResult> {
    if (!this.policy.canManageReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerenciar o plano referencial.');
    }

    const format = sniffFormat(file.buffer, file.originalname);
    const table = await parseTable(file.buffer, format);

    let parsed;
    try {
      parsed = parseReferentialCatalog(table);
    } catch (e) {
      if (e instanceof CatalogHeaderError) throw new ValidationError(e.message);
      throw e;
    }
    if (parsed.errors.length > 0) {
      // All-or-nothing: reject the whole file before any write (no partial catalog).
      throw new ValidationError(summarizeErrors(parsed.errors));
    }
    if (parsed.rows.length === 0) {
      throw new ValidationError('Catálogo referencial vazio: nenhuma linha de conta encontrada.');
    }

    // Upsert every row in ONE tx (atomic per import); idempotent on @@unique[layoutVersion,code].
    await this.repo.runTransaction(async (tx) => {
      for (const row of parsed.rows) {
        await this.repo.upsert({ layoutVersion, ...row }, tx);
      }
    });

    const analyticCount = parsed.rows.filter((r) => r.isAnalytic).length;
    const result: ReferentialCatalogImportResult = {
      layoutVersion,
      totalRows: parsed.rows.length,
      imported: parsed.rows.length,
      analyticCount,
      syntheticCount: parsed.rows.length - analyticCount,
    };

    // Global op → operational log, NOT the per-scope audit chain (ACC-010).
    logger.info('referential_catalog.imported', {
      actorUserId: scope.actorUserId,
      layoutVersion,
      imported: result.imported,
      analyticCount,
    });

    return result;
  }

  /** Lookup/picker over one version's catalog (analytic-code picker for the mapping UI — D3/D10). */
  async lookup(
    scope: AccountingScope,
    version: string,
    query?: ReferentialCatalogQuery,
  ): Promise<ReferentialAccount[]> {
    if (!this.policy.canReadReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o plano referencial.');
    }
    return this.repo.findManyByVersion(version, query);
  }
}
