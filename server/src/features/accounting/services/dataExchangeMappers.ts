import type { AccountingDataExchangeJob, AccountingDataExchangeRow } from 'generated/prisma';

/** Client-facing job summary (omits storageKey — leaks on-disk layout). */
export interface DataExchangeJobResponse {
  id: string;
  direction: string;
  kind: string;
  status: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  committedRows: number;
  createdAt: Date;
}

/** Shared job → response mapper used by the export and import services. */
export function toJobResponse(job: AccountingDataExchangeJob): DataExchangeJobResponse {
  return {
    id: job.id,
    direction: job.direction,
    kind: job.kind,
    status: job.status,
    fileName: job.originalName,
    mimeType: job.mimeType,
    sizeBytes: job.sizeBytes,
    sha256: job.sha256,
    totalRows: job.totalRows,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    committedRows: job.committedRows,
    createdAt: job.createdAt,
  };
}

/** Client-facing import row (for preview + error reports). */
export interface DataExchangeRowResponse {
  rowNumber: number;
  groupKey: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  field: string | null;
  targetType: string | null;
  targetId: string | null;
  raw: unknown;
}

export function toRowResponse(row: AccountingDataExchangeRow): DataExchangeRowResponse {
  let raw: unknown = null;
  try {
    raw = JSON.parse(row.rawJson);
  } catch {
    raw = row.rawJson;
  }
  return {
    rowNumber: row.rowNumber,
    groupKey: row.groupKey,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    field: row.field,
    targetType: row.targetType,
    targetId: row.targetId,
    raw,
  };
}
