import { useState, useMemo } from 'react';
import type { IDynamicTableData, ITableSchema } from '../../../../../components/shared/dynamic-tables.client';
import { StandardPagination } from '../../../../../shared/components/StandardPagination';
import { renderTypedValue } from '../../../../../shared/utils/formatters';

import { useTranslation } from 'next-i18next';

interface TableViewProps {
  schemaFields: ITableSchema['fields'];
  records: IDynamicTableData[];
  relationLookups?: Map<string, string>;
}

function TableView({ schemaFields, records, relationLookups }: TableViewProps) {
  const { t } = useTranslation(['common', 'database']);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const totalPages = Math.ceil(records.length / itemsPerPage);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return records.slice(start, start + itemsPerPage);
  }, [records, currentPage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-gray-200 dark:border-gray-700/50 rounded-lg shadow-sm overflow-hidden bg-white dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-neutral-800/50">
              <tr>
                {schemaFields.map(field => (
                  <th
                    key={field.name}
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {t(`database:fields.${field.name}`, field.label || field.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700/50">
              {paginatedRecords.length > 0 ? (
                paginatedRecords.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {schemaFields.map(field => (
                      <td key={`${record.id}-${field.name}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {renderTypedValue((record.data as any)[field.name], field.type, { t: (k, d) => t(k, d as string), relationLookup: relationLookups })}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={schemaFields.length} className="text-center py-16 px-4 text-gray-500 dark:text-gray-400">
                    {t('no_records_found', 'Nenhum registro encontrado.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StandardPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={records.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export default TableView;
