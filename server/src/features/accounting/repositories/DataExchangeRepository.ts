import prisma from '../../../lib/prisma';
import type { AccountingDataExchangeJob, AccountingDataExchangeRow, Prisma } from 'generated/prisma';
import { NotFoundError } from '../../../lib/errors';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type { IDataExchangeRepository } from './IDataExchangeRepository';
import type {
  CreateJobInput,
  UpdateJobInput,
  CreateRowInput,
  UpdateRowInput,
} from '../models/DataExchange.model';

/**
 * Prisma-backed repository for the Data Exchange staging tables. The only place touching
 * prisma.accountingDataExchangeJob.*. All reads/updates are tenant-scoped; updateJob uses
 * updateMany so the WHERE can carry userId+unitId (a 0-row result fails loud, never no-op).
 */
export class DataExchangeRepository implements IDataExchangeRepository {
  public async createJob(
    data: CreateJobInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeJob> {
    return (tx ?? prisma).accountingDataExchangeJob.create({
      data: {
        userId: data.userId,
        unitId: data.unitId,
        direction: data.direction,
        kind: data.kind,
        status: data.status,
        requestedById: data.requestedById,
        originalName: data.originalName ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: data.sizeBytes ?? null,
        sha256: data.sha256 ?? null,
        storageKey: data.storageKey ?? null,
        totalRows: data.totalRows ?? 0,
        validRows: data.validRows ?? 0,
        invalidRows: data.invalidRows ?? 0,
      },
    });
  }

  public async findJobById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeJob | null> {
    return (tx ?? prisma).accountingDataExchangeJob.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async updateJob(
    scope: AccountingScope,
    id: string,
    data: UpdateJobInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeJob> {
    const { count } = await (tx ?? prisma).accountingDataExchangeJob.updateMany({
      where: { id, ...accountingScopeWhere(scope) },
      data,
    });
    if (count === 0) {
      throw new NotFoundError(`Job de importação/exportação '${id}' não encontrado.`);
    }
    // Re-read within the same tx for a consistent view.
    const job = await (tx ?? prisma).accountingDataExchangeJob.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
    if (!job) throw new NotFoundError(`Job '${id}' não encontrado após atualização.`);
    return job;
  }

  public async createRows(rows: CreateRowInput[], tx?: Prisma.TransactionClient): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await (tx ?? prisma).accountingDataExchangeRow.createMany({
      data: rows.map((r) => ({
        userId: r.userId,
        unitId: r.unitId,
        jobId: r.jobId,
        rowNumber: r.rowNumber,
        groupKey: r.groupKey ?? null,
        rawJson: r.rawJson,
        normalizedJson: r.normalizedJson ?? null,
        status: r.status,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
        field: r.field ?? null,
      })),
    });
    return count;
  }

  public async findRowsByJob(
    scope: AccountingScope,
    jobId: string,
    opts?: { status?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeRow[]> {
    return (tx ?? prisma).accountingDataExchangeRow.findMany({
      where: { ...accountingScopeWhere(scope), jobId, ...(opts?.status ? { status: opts.status } : {}) },
      orderBy: { rowNumber: 'asc' },
    });
  }

  public async updateRow(
    scope: AccountingScope,
    id: string,
    data: UpdateRowInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { count } = await (tx ?? prisma).accountingDataExchangeRow.updateMany({
      where: { id, ...accountingScopeWhere(scope) },
      data,
    });
    if (count === 0) {
      throw new NotFoundError(`Linha de importação '${id}' não encontrada.`);
    }
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
