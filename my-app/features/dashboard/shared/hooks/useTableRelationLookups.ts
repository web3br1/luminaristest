'use client';

import { useState, useEffect } from 'react';
import type { IDynamicTable, ISchemaField, ITableSchema } from '../../components/shared/dynamic-tables.client';
import { isTableSchema } from '../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';
import { formatRelatedDisplayValue } from '../../components/shared/relation-utils.client';

/**
 * useTableRelationLookups
 *
 * Scans the schema of any table, identifies relation fields, fetches target
 * table data in parallel, and builds a Map<id, displayName> per field.
 *
 * If `allTables` is provided, the hook resolves the target table's
 * `defaultDisplayField` locally (zero extra HTTP calls). Otherwise it falls
 * back to the regex heuristic in `formatRelatedDisplayValue`.
 */
export function useTableRelationLookups(
    table: IDynamicTable | null | undefined,
    allTables?: IDynamicTable[],
    excludeFields?: string[]
): {
    relationLookups: Record<string, Map<string, string>>;
    isLoadingRelations: boolean;
} {
    const [relationLookups, setRelationLookups] = useState<Record<string, Map<string, string>>>({});
    const [isLoadingRelations, setIsLoadingRelations] = useState(false);

    useEffect(() => {
        let isCancelled = false;

        async function buildLookups() {
            if (!table || !isTableSchema(table.schema)) {
                if (!isCancelled) setRelationLookups({});
                return;
            }

            const fields: ISchemaField[] = table.schema.fields || [];
            const relFields = fields.filter(
                (f) =>
                    f.type === 'relation' &&
                    f.relation?.targetTable &&
                    !excludeFields?.includes(f.name)
            );

            if (relFields.length === 0) {
                if (!isCancelled) setRelationLookups({});
                return;
            }

            setIsLoadingRelations(true);
            try {
                const entries: Record<string, Map<string, string>> = {};
                await Promise.all(
                    relFields.map(async (field) => {
                        try {
                            const targetTableId = field.relation?.targetTable;
                            if (!targetTableId) return;
                            const body = await DynamicTableService.getTableData(targetTableId);

                            // Resolve defaultDisplayField from the target table schema,
                            // using allTables if available (zero extra HTTP calls).
                            let displayField: string | undefined;
                            if (allTables) {
                                const targetTable = allTables.find(
                                    t => t.id === targetTableId
                                );
                                const targetSchema = targetTable?.schema;
                                if (isTableSchema(targetSchema)) {
                                    displayField = (targetSchema as ITableSchema & { defaultDisplayField?: string }).defaultDisplayField;
                                }
                            }

                            const map = new Map<string, string>();
                            type RecordLike = { id?: string; data?: Record<string, unknown>; [key: string]: unknown };
                            for (const row of ((body?.data || []) as RecordLike[])) {
                                map.set(String(row.id), formatRelatedDisplayValue(row, displayField));
                            }
                            entries[field.name] = map;
                        } catch {
                            // Silently skip — field shows raw value as fallback
                        }
                    })
                );
                if (!isCancelled) setRelationLookups(entries);
            } finally {
                if (!isCancelled) setIsLoadingRelations(false);
            }
        }

        buildLookups();
        return () => { isCancelled = true; };
    }, [table, allTables, excludeFields]);

    return { relationLookups, isLoadingRelations };
}
