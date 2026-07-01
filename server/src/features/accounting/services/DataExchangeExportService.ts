import { createHash } from 'node:crypto';
import type { AccountingDataExchangeJob } from 'generated/prisma';
import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import * as storage from '../../../lib/attachmentStorage';
import { serializeTable, type OutTable } from '../../../lib/spreadsheet';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IDataExchangeRepository } from '../repositories/IDataExchangeRepository';
import type { AuditService } from './AuditService';
import type { ExportRequestDto } from '../dtos/DataExchangeDto';
import type { ImportKind } from '../models/DataExchange.model';
import { toJobResponse, type DataExchangeJobResponse } from './dataExchangeMappers';
import type {
  TrialBalanceReport,
  AccountLedgerReport,
  BalanceSheetReport,
  IncomeStatementReport,
} from './AccountingReportService';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Minimal read surface the exporter needs — satisfied structurally by AccountingReportService. */
export interface IReportReader {
  trialBalance(scope: AccountingScope): Promise<TrialBalanceReport>;
  accountLedger(scope: AccountingScope, accountCode: string): Promise<AccountLedgerReport>;
  balanceSheet(scope: AccountingScope, asOf: Date): Promise<BalanceSheetReport>;
  incomeStatement(scope: AccountingScope, asOf: Date): Promise<IncomeStatementReport>;
}

/** Metadata + resolved absolute path for streaming an export artifact. */
export interface ArtifactDownloadTarget {
  job: AccountingDataExchangeJob;
  absPath: string;
  fileName: string;
  mimeType: string;
}

/** Blank-template header rows, keyed by import kind. */
const TEMPLATE_HEADERS: Record<ImportKind, string[]> = {
  IMPORT_CHART_OF_ACCOUNTS: ['code', 'name', 'nature', 'acceptsEntries', 'parentCode'],
  IMPORT_OPENING_BALANCES: ['accountCode', 'postingDate', 'description', 'debitCents', 'creditCents'],
  IMPORT_JOURNAL_ENTRIES: [
    'entryKey', 'documentDate', 'postingDate', 'description',
    'accountCode', 'debitCents', 'creditCents', 'lineDescription', 'externalReference',
  ],
};

/**
 * Export half of the accounting Data Exchange (BE-INCR-6). Renders read-only report data
 * or blank import templates to CSV/XLSX, persists the artifact via the reused disk store,
 * and records an EXPORT job + `data_exchange.export_generated` audit in one tx. No prisma.*
 * and no Express here. Cross-tenant access surfaces as NotFoundError.
 */
export class DataExchangeExportService {
  constructor(
    private readonly reports: IReportReader,
    private readonly policy: IAccountingPolicy,
    private readonly repo: IDataExchangeRepository,
    private readonly audit: AuditService,
  ) {}

  /** Builds the tabular payload for a given export kind. */
  private async buildTable(scope: AccountingScope, dto: ExportRequestDto): Promise<OutTable> {
    switch (dto.kind) {
      case 'EXPORT_TRIAL_BALANCE': {
        const r = await this.reports.trialBalance(scope);
        return {
          headers: ['code', 'name', 'nature', 'debitCents', 'creditCents', 'balanceCents'],
          rows: r.rows.map((row) => [row.code, row.name, row.nature, row.debitCents, row.creditCents, row.balanceCents]),
        };
      }
      case 'EXPORT_GENERAL_LEDGER': {
        const r = await this.reports.accountLedger(scope, dto.accountCode as string);
        return {
          headers: ['date', 'entryId', 'description', 'status', 'debitCents', 'creditCents', 'runningBalanceCents'],
          rows: r.rows.map((row) => [
            row.date.toISOString().slice(0, 10), row.entryId, row.description, row.status,
            row.debitCents, row.creditCents, row.runningBalanceCents,
          ]),
        };
      }
      case 'EXPORT_BALANCE_SHEET': {
        const r = await this.reports.balanceSheet(scope, new Date(dto.asOf as string));
        const rows: OutTable['rows'] = [];
        const push = (section: string, lines: { code: string; name: string; amountCents: string }[]) =>
          lines.forEach((l) => rows.push([section, l.code, l.name, l.amountCents]));
        push('ASSETS', r.assets.accounts);
        push('LIABILITIES', r.liabilities.accounts);
        push('EQUITY', r.equity.accounts);
        rows.push(['NET_RESULT', '', 'Resultado do período', r.netResultLine.amountCents]);
        return { headers: ['section', 'code', 'name', 'amountCents'], rows };
      }
      case 'EXPORT_INCOME_STATEMENT': {
        const r = await this.reports.incomeStatement(scope, new Date(dto.asOf as string));
        const rows: OutTable['rows'] = [];
        const push = (section: string, lines: { code: string; name: string; amountCents: string }[]) =>
          lines.forEach((l) => rows.push([section, l.code, l.name, l.amountCents]));
        push('GROSS_REVENUE', r.grossRevenue.accounts);
        push('REVENUE_DEDUCTIONS', r.revenueDeductions.accounts);
        push('EXPENSES', r.expenses.accounts);
        rows.push(['NET_RESULT', '', 'Resultado líquido', r.netResult.amountCents]);
        return { headers: ['section', 'code', 'name', 'amountCents'], rows };
      }
      case 'EXPORT_TEMPLATE': {
        return { headers: TEMPLATE_HEADERS[dto.templateKind as ImportKind], rows: [] };
      }
      default:
        // Exhaustiveness guard — the DTO enum should prevent reaching here.
        throw new NotFoundError(`Tipo de exportação não suportado: ${dto.kind}`);
    }
  }

  /** Renders + persists an export artifact and records the job + audit. Returns the job summary. */
  public async export(scope: AccountingScope, dto: ExportRequestDto): Promise<DataExchangeJobResponse> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a exportar dados contábeis.');
    }

    const table = await this.buildTable(scope, dto);
    const buffer = await serializeTable(table, dto.format);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const fileName = `${dto.kind.toLowerCase()}.${dto.format}`;
    const mimeType = dto.format === 'csv' ? 'text/csv' : XLSX_MIME;

    const job = await this.repo.createJob({
      userId: scope.ownerUserId,
      unitId: scope.unitId,
      direction: 'EXPORT',
      kind: dto.kind,
      status: 'EXPORTED',
      requestedById: scope.actorUserId,
      originalName: fileName,
      mimeType,
      sizeBytes: buffer.length,
      sha256,
      totalRows: table.rows.length,
    });

    const { storageKey } = await storage.saveFile(
      scope.ownerUserId, scope.unitId, job.id, fileName, buffer,
    );

    const updated = await this.repo.runTransaction(async (tx) => {
      const j = await this.repo.updateJob(scope, job.id, { storageKey }, tx);
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'data_exchange.export_generated',
        targetType: 'data_exchange_job',
        targetId: job.id,
        payload: {
          jobId: job.id,
          kind: dto.kind,
          direction: 'EXPORT',
          sha256,
          totalRows: String(table.rows.length),
          validRows: String(table.rows.length),
          invalidRows: '0',
        },
      });
      return j;
    });

    return toJobResponse(updated);
  }

  /** Fetches a single job summary (scoped). */
  public async getJob(scope: AccountingScope, id: string): Promise<DataExchangeJobResponse> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a consultar jobs de dados contábeis.');
    }
    const job = await this.repo.findJobById(scope, id);
    if (!job) throw new NotFoundError('Job não encontrado.');
    return toJobResponse(job);
  }

  /**
   * Resolves metadata + absolute path for streaming an export artifact. Download audit is
   * feature-flagged (AUDIT_DATA_EXCHANGE_DOWNLOADS=true) like attachment downloads.
   */
  public async getArtifactForDownload(scope: AccountingScope, id: string): Promise<ArtifactDownloadTarget> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a baixar artefatos contábeis.');
    }
    const job = await this.repo.findJobById(scope, id);
    if (!job || !job.storageKey) throw new NotFoundError('Artefato não encontrado.');

    if (process.env.AUDIT_DATA_EXCHANGE_DOWNLOADS === 'true') {
      await this.repo.runTransaction(async (tx) => {
        await this.audit.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'data_exchange.artifact_downloaded',
          targetType: 'data_exchange_job',
          targetId: job.id,
          payload: { jobId: job.id, kind: job.kind, direction: job.direction, sha256: job.sha256 ?? '' },
        });
      });
    }

    return {
      job,
      absPath: storage.resolveReadPath(job.storageKey),
      fileName: job.originalName ?? `${job.kind.toLowerCase()}`,
      mimeType: job.mimeType ?? 'application/octet-stream',
    };
  }
}
