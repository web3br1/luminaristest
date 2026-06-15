'use client';

import { useState, useEffect } from 'react';
import { getCookie } from 'cookies-next';
import { ITableSchema, ISchemaField } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { formatRelatedDisplayValue } from '@/features/dashboard/components/shared/relation-utils.client';

export type RelationLookups = Record<string, Map<string, string>>;

export function useRelationLookups(schema: ITableSchema | null) {
    const [lookups, setLookups] = useState<RelationLookups>({});
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let isCancelled = false;

        async function fetchRelations() {
            if (!schema || !schema.fields) {
                setLookups({});
                return;
            }

            const relationFields = (schema.fields || []).filter((f: ISchemaField) => f.type === 'relation' && f.relation?.targetTable);
            if (relationFields.length === 0) {
                setLookups({});
                return;
            }

            setIsLoading(true);
            const token = getCookie('auth_token');
            const headers: HeadersInit | undefined = token ? { 'Authorization': `Bearer ${token}` } : undefined;
            const newLookups: RelationLookups = {};

            try {
                await Promise.all(relationFields.map(async (field: ISchemaField) => {
                    try {
                        const targetTableId = field.relation?.targetTable;
                        if (!targetTableId) return;

                        const body = await DynamicTableService.getTableData(targetTableId).catch(() => ({}));
                        const data = body.data || [];

                        const map = new Map<string, string>();
                        data.forEach((record) => {
                            map.set(String(record.id), formatRelatedDisplayValue(record));
                        });

                        newLookups[field.name] = map;
                    } catch (err) {
                        console.error(`Error fetching relation for field ${field.name}:`, err);
                    }
                }));

                if (!isCancelled) {
                    setLookups(newLookups);
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchRelations();

        return () => {
            isCancelled = true;
        };
    }, [schema]);

    return { lookups, isLoading };
}
