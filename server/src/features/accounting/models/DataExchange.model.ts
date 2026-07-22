import type { SpreadsheetFormat } from '../../../lib/spreadsheet';

/**
 * Domain types for the accounting Data Exchange (BE/FE-INCR-6).
 * Kinds are string unions validated in the DTO; the Prisma columns stay plain strings.
 */

export const IMPORT_KINDS = [
  'IMPORT_CHART_OF_ACCOUNTS',
  'IMPORT_OPENING_BALANCES',
  'IMPORT_JOURNAL_ENTRIES',
] as const;

export const EXPORT_KINDS = [
  'EXPORT_TRIAL_BALANCE',
  'EXPORT_GENERAL_LEDGER',
  'EXPORT_BALANCE_SHEET',
  'EXPORT_INCOME_STATEMENT',
  'EXPORT_IMPORT_ERRORS',
  'EXPORT_TEMPLATE',
  // SPED Contábil (ECD) file — a plain-text `.txt` artifact, not a spreadsheet.
  // Column is a plain String (ADR-INCR-SPED-ECD D1) ⇒ new kind = zero migration.
  'EXPORT_SPED_ECD',
  // SPED Fiscal (ECF · Lucro Presumido) file (ADR-INCR-SPED-ECF D7) ⇒ zero migration.
  'EXPORT_SPED_ECF',
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number];
export type ExportKind = (typeof EXPORT_KINDS)[number];
export type DataExchangeKind = ImportKind | ExportKind;

export type DataExchangeDirection = 'IMPORT' | 'EXPORT';

export type DataExchangeStatus =
  | 'UPLOADED'
  | 'VALIDATED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'PARTIAL'
  | 'FAILED'
  | 'EXPORTED';

export type { SpreadsheetFormat };

/** Filters accepted by report exports (kind-dependent; validated per kind in the service). */
export interface ExportFilters {
  unitId: string;
  asOf?: string;        // YYYY-MM-DD — balance-sheet / income-statement / trial-balance-as-of
  accountCode?: string; // general-ledger
  templateKind?: ImportKind; // EXPORT_TEMPLATE
  sourceJobId?: string; // EXPORT_IMPORT_ERRORS
}

/** Row shape accepted by the repository create (mirrors the Prisma model, tenancy pre-resolved). */
export interface CreateJobInput {
  userId: string;
  unitId: string;
  direction: DataExchangeDirection;
  kind: DataExchangeKind;
  status: DataExchangeStatus;
  requestedById: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  storageKey?: string | null;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
}

/** Partial mutation of a job (status transitions, artifact metadata, commit counters). */
export interface UpdateJobInput {
  status?: DataExchangeStatus;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  storageKey?: string | null;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  committedRows?: number;
  committedById?: string | null;
  committedAt?: Date | null;
}

export type RowStatus = 'VALID' | 'INVALID' | 'COMMITTED' | 'SKIPPED';

/** A validated row produced by the import validators (pure, before persistence). */
export interface ValidatedRow {
  rowNumber: number;
  groupKey?: string | null;
  rawJson: string;
  normalizedJson?: string | null;
  status: Extract<RowStatus, 'VALID' | 'INVALID'>;
  errorCode?: string | null;
  errorMessage?: string | null;
  field?: string | null;
}

/** Row create shape for the repository (tenancy + jobId added at persist time). */
export interface CreateRowInput extends ValidatedRow {
  userId: string;
  unitId: string;
  jobId: string;
}

/** Partial mutation of a row at commit time (outcome + created target). */
export interface UpdateRowInput {
  status?: RowStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  targetType?: string | null;
  targetId?: string | null;
}
