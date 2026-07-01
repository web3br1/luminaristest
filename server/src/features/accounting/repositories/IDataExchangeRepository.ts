import type { AccountingDataExchangeJob, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import type { CreateJobInput, UpdateJobInput } from '../models/DataExchange.model';

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
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
