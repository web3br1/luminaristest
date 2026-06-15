import React from 'react';
import type { CrmRecord } from '../hooks/useCrmData';

export interface Column {
  key: string;
  label: string;
  render?: (value: unknown, row: CrmRecord) => React.ReactNode;
}

interface RecordTableProps {
  columns: Column[];
  rows: CrmRecord[];
  emptyLabel: string;
}

/** Generic, on-brand table for rendering DynamicTable records on CRM list screens. */
export function RecordTable({ columns, rows, emptyLabel }: RecordTableProps) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-900">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-white/5">
        <thead className="bg-gray-50/70 dark:bg-neutral-800/50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-neutral-800/40">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {c.render ? c.render(row.data?.[c.key], row) : String(row.data?.[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
