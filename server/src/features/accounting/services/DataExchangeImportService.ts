import { createHash } from 'node:crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import * as storage from '../../../lib/attachmentStorage';
import { parseTable, type SpreadsheetFormat } from '../../../lib/spreadsheet';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IDataExchangeRepository } from '../repositories/IDataExchangeRepository';
import type { AuditService } from './AuditService';
import type { ImportKind } from '../models/DataExchange.model';
import { validateImport, ImportHeaderError, type AccountLike } from './dataExchangeValidators';
import {
  toJobResponse,
  toRowResponse,
  type DataExchangeJobResponse,
  type DataExchangeRowResponse,
} from './dataExchangeMappers';

/** Uploaded file surface the service needs (a multer memory-storage file). */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/** Minimal account read surface for validation — satisfied by PostingService. */
export interface IAccountReader {
  listAccounts(scope: AccountingScope): Promise<Array<{ id: string; code: string; acceptsEntries: boolean }>>;
}

/** Minimal write surface for commit — satisfied by PostingService. */
export interface IPoster {
  createAccount(
    scope: AccountingScope,
    dto: { code: string; name: string; nature: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'; acceptsEntries?: boolean; unitId: string },
  ): Promise<{ id: string; code: string }>;
  postEntry(
    scope: AccountingScope,
    input: {
      unitId: string; date: string; description: string; sourceType?: string; sourceId?: string;
      lines: Array<{ accountCode: string; debitCents: number; creditCents: number }>;
    },
  ): Promise<{ id: string }>;
}

/** XLSX files are ZIP-based (PK magic); everything else is treated as CSV/text. */
function sniffFormat(buffer: Buffer, name: string): SpreadsheetFormat {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';
  if (name.toLowerCase().endsWith('.xlsx')) return 'xlsx';
  return 'csv';
}

type NormalizedChart = { code: string; name: string; nature: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'; acceptsEntries: boolean };
type NormalizedLine = { accountCode: string; postingDate: string; description?: string; debitCents: number; creditCents: number; entryKey?: string; externalReference?: string };

/**
 * Import half of the accounting Data Exchange (BE-INCR-6). Two steps:
 *
 *  1. uploadAndValidate — parse CSV/XLSX, validate each row per kind, persist a VALIDATED
 *     job + its rows, and record `data_exchange.import_uploaded`. Advisory validation only.
 *  2. commit — for each VALID row/group, write through the canonical accounting services
 *     (createAccount / postEntry), which re-enforce the authoritative invariants (period
 *     gate, balance, leaf accounts) inside their own tx. Per-entry atomic, partial success.
 *
 * Never inserts ledger data directly. Cross-tenant access surfaces as NotFoundError.
 */
export class DataExchangeImportService {
  constructor(
    private readonly repo: IDataExchangeRepository,
    private readonly policy: IAccountingPolicy,
    private readonly audit: AuditService,
    private readonly accounts: IAccountReader,
    private readonly poster: IPoster,
  ) {}

  /** Job summary (scoped). */
  public async getJob(scope: AccountingScope, id: string): Promise<DataExchangeJobResponse> {
    if (!this.policy.canRead(scope)) throw new ForbiddenError('Não autorizado.');
    const job = await this.repo.findJobById(scope, id);
    if (!job) throw new NotFoundError('Job não encontrado.');
    return toJobResponse(job);
  }

  /** Rows of an import job (preview / error report), optionally filtered by status. */
  public async listRows(
    scope: AccountingScope,
    jobId: string,
    opts?: { status?: string },
  ): Promise<DataExchangeRowResponse[]> {
    if (!this.policy.canRead(scope)) throw new ForbiddenError('Não autorizado.');
    const job = await this.repo.findJobById(scope, jobId);
    if (!job) throw new NotFoundError('Job não encontrado.');
    const rows = await this.repo.findRowsByJob(scope, jobId, opts);
    return rows.map(toRowResponse);
  }

  /** Parse + validate an uploaded file, persisting a staged (VALIDATED) job. */
  public async uploadAndValidate(
    scope: AccountingScope,
    kind: ImportKind,
    file: UploadedFile,
  ): Promise<DataExchangeJobResponse> {
    if (!this.policy.canManage(scope)) {
      throw new ForbiddenError('Não autorizado a importar dados contábeis.');
    }

    const format = sniffFormat(file.buffer, file.originalname);
    const table = await parseTable(file.buffer, format);
    const accountList: AccountLike[] = (await this.accounts.listAccounts(scope)).map((a) => ({
      code: a.code,
      acceptsEntries: a.acceptsEntries,
    }));

    let validated;
    try {
      validated = validateImport(kind, table, accountList);
    } catch (e) {
      if (e instanceof ImportHeaderError) throw new ValidationError(e.message);
      throw e;
    }

    const validRows = validated.filter((r) => r.status === 'VALID').length;
    const invalidRows = validated.length - validRows;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const mimeType = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';

    const job = await this.repo.createJob({
      userId: scope.ownerUserId,
      unitId: scope.unitId,
      direction: 'IMPORT',
      kind,
      status: 'VALIDATED',
      requestedById: scope.actorUserId,
      originalName: file.originalname,
      mimeType,
      sizeBytes: file.buffer.length,
      sha256,
      totalRows: validated.length,
      validRows,
      invalidRows,
    });

    const { storageKey } = await storage.saveFile(
      scope.ownerUserId, scope.unitId, job.id, file.originalname || 'import', file.buffer,
    );

    try {
      const updated = await this.repo.runTransaction(async (tx) => {
        const j = await this.repo.updateJob(scope, job.id, { storageKey }, tx);
        await this.repo.createRows(
          validated.map((r) => ({ ...r, userId: scope.ownerUserId, unitId: scope.unitId, jobId: job.id })),
          tx,
        );
        await this.audit.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'data_exchange.import_uploaded',
          targetType: 'data_exchange_job',
          targetId: job.id,
          payload: { jobId: job.id, kind, direction: 'IMPORT', sha256, totalRows: String(validated.length), validRows: String(validRows), invalidRows: String(invalidRows) },
        });
        return j;
      });
      return toJobResponse(updated);
    } catch (e) {
      // TX-001 compensation: the source file was written before the tx — drop the orphan.
      await storage.deleteFile(storageKey);
      throw e;
    }
  }

  /**
   * Commit the VALID rows of a staged import. Idempotent: rows already COMMITTED are skipped
   * (re-commit retries only still-VALID rows); postEntry dedups on (sourceType, sourceId).
   */
  public async commit(scope: AccountingScope, jobId: string): Promise<DataExchangeJobResponse> {
    if (!this.policy.canManage(scope)) {
      throw new ForbiddenError('Não autorizado a confirmar importação contábil.');
    }
    const job = await this.repo.findJobById(scope, jobId);
    if (!job || job.direction !== 'IMPORT') throw new NotFoundError('Job de importação não encontrado.');
    if (job.status === 'COMMITTED') return toJobResponse(job);

    const validRows = await this.repo.findRowsByJob(scope, jobId, { status: 'VALID' });

    let committed = 0;
    let failed = false;
    const kind = job.kind as ImportKind;

    if (kind === 'IMPORT_CHART_OF_ACCOUNTS') {
      const existing = new Set((await this.accounts.listAccounts(scope)).map((a) => a.code));
      for (const row of validRows) {
        const n = JSON.parse(row.normalizedJson as string) as NormalizedChart;
        if (existing.has(n.code)) {
          await this.repo.updateRow(scope, row.id, { status: 'SKIPPED', errorCode: 'ACCOUNT_EXISTS', errorMessage: 'Conta já existe — não atualizada nesta versão.' });
          continue;
        }
        try {
          const acc = await this.poster.createAccount(scope, {
            code: n.code, name: n.name, nature: n.nature, acceptsEntries: n.acceptsEntries, unitId: scope.unitId,
          });
          existing.add(n.code);
          await this.repo.updateRow(scope, row.id, { status: 'COMMITTED', targetType: 'ACCOUNT', targetId: acc.id });
          committed++;
        } catch (e) {
          failed = true;
          await this.repo.updateRow(scope, row.id, { errorCode: 'CREATE_FAILED', errorMessage: (e as Error).message });
        }
      }
    } else if (kind === 'IMPORT_OPENING_BALANCES') {
      committed = await this.commitOpeningBalances(scope, job.id, validRows).catch(() => {
        failed = true;
        return 0;
      });
    } else if (kind === 'IMPORT_JOURNAL_ENTRIES') {
      const result = await this.commitJournalEntries(scope, validRows);
      committed = result.committed;
      failed = result.failed;
    }

    const status = committed > 0 ? 'COMMITTED' : 'FAILED';
    const updated = await this.repo.runTransaction(async (tx) => {
      const j = await this.repo.updateJob(scope, job.id, {
        status, committedRows: committed, committedById: scope.actorUserId, committedAt: new Date(),
      }, tx);
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: committed > 0 ? 'data_exchange.import_committed' : 'data_exchange.import_failed',
        targetType: 'data_exchange_job',
        targetId: job.id,
        payload: committed > 0
          ? { jobId: job.id, kind, direction: 'IMPORT', sha256: job.sha256 ?? '', totalRows: String(job.totalRows), validRows: String(job.validRows), invalidRows: String(job.invalidRows), committedRows: String(committed) }
          : { jobId: job.id, kind, direction: 'IMPORT', errorCode: 'COMMIT_FAILED' },
      });
      return j;
    });
    void failed;
    return toJobResponse(updated);
  }

  /** Opening balances commit as ONE balanced entry (all-or-nothing); idempotent on jobId. */
  private async commitOpeningBalances(
    scope: AccountingScope,
    jobId: string,
    validRows: Awaited<ReturnType<IDataExchangeRepository['findRowsByJob']>>,
  ): Promise<number> {
    if (validRows.length === 0) return 0;
    const lines = validRows.map((row) => {
      const n = JSON.parse(row.normalizedJson as string) as NormalizedLine;
      return { accountCode: n.accountCode, debitCents: n.debitCents, creditCents: n.creditCents };
    });
    const first = JSON.parse(validRows[0].normalizedJson as string) as NormalizedLine;

    const entry = await this.poster.postEntry(scope, {
      unitId: scope.unitId,
      date: first.postingDate,
      description: 'Saldos iniciais (importação)',
      sourceType: 'ACCOUNTING_OPENING_BALANCE_IMPORT',
      sourceId: jobId,
      lines,
    });
    for (const row of validRows) {
      await this.repo.updateRow(scope, row.id, { status: 'COMMITTED', targetType: 'JOURNAL_ENTRY', targetId: entry.id });
    }
    return validRows.length;
  }

  /** Journal entries commit one postEntry per entryKey group; per-group atomic, partial success. */
  private async commitJournalEntries(
    scope: AccountingScope,
    validRows: Awaited<ReturnType<IDataExchangeRepository['findRowsByJob']>>,
  ): Promise<{ committed: number; failed: boolean }> {
    const groups = new Map<string, typeof validRows>();
    for (const row of validRows) {
      const key = row.groupKey ?? `__row_${row.rowNumber}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
    }

    let committed = 0;
    let failed = false;
    for (const [, group] of groups) {
      const parsed = group.map((r) => JSON.parse(r.normalizedJson as string) as NormalizedLine);
      const head = parsed[0];
      try {
        const entry = await this.poster.postEntry(scope, {
          unitId: scope.unitId,
          date: head.postingDate,
          description: head.description ?? 'Lançamento importado',
          sourceType: 'IMPORT_JOURNAL_ENTRIES',
          sourceId: head.externalReference || undefined,
          lines: parsed.map((n) => ({ accountCode: n.accountCode, debitCents: n.debitCents, creditCents: n.creditCents })),
        });
        for (const row of group) {
          await this.repo.updateRow(scope, row.id, { status: 'COMMITTED', targetType: 'JOURNAL_ENTRY', targetId: entry.id });
        }
        committed += group.length;
      } catch (e) {
        failed = true;
        for (const row of group) {
          await this.repo.updateRow(scope, row.id, { errorCode: 'POST_FAILED', errorMessage: (e as Error).message });
        }
      }
    }
    return { committed, failed };
  }
}
