import type { AccountingDataExchangeJob, AccountingDataExchangeRow, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import type {
  CreateJobInput,
  UpdateJobInput,
  CreateRowInput,
  UpdateRowInput,
} from '../models/DataExchange.model';

/**
 * Repository contract for the accounting Data Exchange staging tables. Only place with
 * prisma.accountingDataExchangeJob.* / accountingDataExchangeRow.* access. Two-level
 * tenancy via AccountingScope on every read/update.
 */
export interface IDataExchangeRepository {
  createJob(data: CreateJobInput, tx?: Prisma.TransactionClient): Promise<AccountingDataExchangeJob>;
  findJobById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeJob | null>;
  updateJob(
    scope: AccountingScope,
    id: string,
    data: UpdateJobInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeJob>;
  createRows(rows: CreateRowInput[], tx?: Prisma.TransactionClient): Promise<number>;
  findRowsByJob(
    scope: AccountingScope,
    jobId: string,
    opts?: { status?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingDataExchangeRow[]>;
  updateRow(
    scope: AccountingScope,
    id: string,
    data: UpdateRowInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
