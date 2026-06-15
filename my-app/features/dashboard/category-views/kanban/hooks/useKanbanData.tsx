'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { IDynamicTable, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { Task } from '../../../../../types/Task.types';

export function useKanbanData(tables: IDynamicTable[]) {
    // Filter tables with 'kanban' or 'tasks' category
    const kanbanTables = useMemo(() => {
        return tables.filter(t =>
            t.category === 'kanban' ||
            t.category === 'tasks' ||
            t.internalName === 'tasks' ||
            t.name.toLowerCase() === 'tasks' ||
            t.name.toLowerCase() === 'tarefas'
        );
    }, [tables]);

    const [aggregatedData, setAggregatedData] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [schemaMap, setSchemaMap] = useState<Record<string, unknown>>({});
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (kanbanTables.length === 0) {
            setIsLoading(false);
            setAggregatedData([]);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const results: Task[] = [];
            const newSchemaMap: Record<string, unknown> = {};

            await Promise.all(kanbanTables.map(async (table) => {
                const [tableData, tableRecords] = await Promise.all([
                    DynamicTableService.getTableById(table.id).catch(() => null),
                    DynamicTableService.getTableData(table.id).catch(() => null)
                ]);

                if (tableData?.success && tableData.data) {
                    newSchemaMap[table.id] = tableData.data.schema || table.schema;
                } else {
                    newSchemaMap[table.id] = table.schema;
                }

                if (tableRecords?.success && tableRecords.data) {
                    const records = tableRecords.data || [];

                    // Extract columns to determine default status
                    let defaultStatus = 'todo';
                    const schema = newSchemaMap[table.id];
                    if (schema && schema.fields) {
                        const statusField = schema.fields.find((f: ISchemaField) => f.name === 'status');
                        if (statusField && statusField.options && statusField.options.length > 0) {
                            defaultStatus = typeof statusField.options[0] === 'string'
                                ? statusField.options[0]
                                : statusField.options[0].value;
                        }
                    }

                    records.forEach((record) => {
                        const data = record.data || {};
                        results.push({
                            ...data, // Preserve all dynamic fields from the backend
                            id: record.id,
                            name: data.name || data.title || 'Untitled',
                            description: data.description || '',
                            status: data.status || defaultStatus,
                            priority: data.priority || 'Low',
                            createdAt: record.createdAt || null,
                            updatedAt: record.updatedAt || null,
                            dynamicTableId: table.id,
                        });
                    });
                } else {
                    console.error(`Failed to fetch data for table ${table.name}`);
                }
            }));

            setAggregatedData(results);
            setSchemaMap(newSchemaMap);
        } catch (err) {
            console.error('Error fetching kanban data:', err);
            setError('Failed to load tasks');
        } finally {
            setIsLoading(false);
        }
    }, [kanbanTables]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return {
        kanbanTables,
        tasks: aggregatedData,
        isLoading,
        error,
        refetch: fetchData,
        schemaByTableId: schemaMap,
    };
}
