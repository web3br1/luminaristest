import type { IDynamicTableData } from './dynamic-tables.client';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';
import { formatDate } from '../../shared/utils/formatters';

export async function fetchRelatedTableData(tableKey: string): Promise<IDynamicTableData[]> {
  if (!tableKey || typeof tableKey !== 'string' || tableKey.trim().length === 0) {
    return [];
  }

  try {
    const body = await DynamicTableService.getTableData(tableKey);
    return body.data || [];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load related data';
    throw new Error(message);
  }
}

function formatIfDate(value: unknown): string {
  if (typeof value !== 'string') return String(value);
  // ISO datetime: "2026-04-27T16:00:00.000Z"
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value, undefined, { showTime: true });
  // Date-only: "2026-04-27"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value, undefined, { dateOnly: true });
  return value;
}

/**
 * Accepts either:
 *  - canonical IDynamicTableData ({ id, data })
 *  - a flat record where the data fields are siblings of id (legacy/raw API shape)
 * Returns a best-effort display label, falling back to the record id.
 */
type RecordLike = IDynamicTableData | { id?: string; data?: Record<string, unknown>; [key: string]: unknown } | null | undefined;

export function formatRelatedDisplayValue(record: RecordLike, displayField?: string): string {
  try {
    if (!record) return '';
    const dataObj: Record<string, unknown> = (record as { data?: Record<string, unknown> }).data
      ?? (record as Record<string, unknown>);
    const fallbackId = String((record as { id?: string }).id ?? '');
    if (!dataObj) return fallbackId;

    if (displayField && dataObj[displayField] !== undefined) {
      return formatIfDate(dataObj[displayField]);
    }

    const nameKey = Object.keys(dataObj).find(k => /name|title|nome|titulo|fantasyName|companyName|leadName/i.test(k));
    if (nameKey && dataObj[nameKey] !== undefined) {
      return formatIfDate(dataObj[nameKey]);
    }

    const firstStrKey = Object.keys(dataObj).find(k => typeof dataObj[k] === 'string' && k !== 'id');
    const value = firstStrKey ? dataObj[firstStrKey] : undefined;

    return value !== undefined && value !== null ? formatIfDate(value) : fallbackId;
  } catch {
    return String((record as { id?: string } | null | undefined)?.id ?? '');
  }
}
