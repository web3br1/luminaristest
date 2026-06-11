'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { IDynamicTable, ITableSchema, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { isTableSchema } from '../../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { formatRelatedDisplayValue } from '../../../components/shared/relation-utils.client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PersonRecord {
    id: string;
    tableId: string;
    tableName: string;
    tableCategory: string;
    data: Record<string, unknown>;
    name: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    role: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
    tableInternalName: string;
}

export interface PeopleStats {
    total: number;
    active: number;
    inactive: number;
    byTable: Record<string, number>;
}

// Shape mínima dos registros retornados pela API
type RawRecord = { id: string; data?: Record<string, unknown>; createdAt?: string };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function findField(data: Record<string, unknown>, keys: string[]): string | null {
    if (!data) return null;
    for (const key of keys) {
        const lowerKey = key.toLowerCase();
        for (const [k, v] of Object.entries(data)) {
            if (k.toLowerCase() === lowerKey && v != null && v !== '') {
                return String(v);
            }
        }
    }
    return null;
}

const extractName = (data: Record<string, unknown>) =>
    findField(data, ['name', 'nome', 'fullName', 'customerName', 'employeeName', 'supplierName', 'contactName']) || 'Unnamed';

const extractEmail = (data: Record<string, unknown>) =>
    findField(data, ['email', 'emailAddress', 'mail', 'e-mail']);

const extractPhone = (data: Record<string, unknown>) =>
    findField(data, ['phone', 'telefone', 'phoneNumber', 'mobile', 'celular', 'whatsapp']);

const extractRole = (data: Record<string, unknown>) =>
    findField(data, ['role', 'cargo', 'position', 'funcao', 'type', 'tipo']);

const extractStatus = (data: Record<string, unknown>) => {
    const status = findField(data, ['isActive', 'active', 'ativo', 'status', 'status_label']);
    if (status === null) return true;
    const s = status.toLowerCase();
    return s !== 'false' && s !== '0' && s !== 'inactive' && s !== 'inativo' && s !== 'blocked';
};

const extractAvatar = (data: Record<string, unknown>) =>
    findField(data, ['avatar', 'avatarUrl', 'photo', 'foto', 'image', 'imagem', 'profilePicture']);

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * usePeopleData aggregates multiple tables categorized as 'people'.
 *
 * Design notes:
 * - Cannot use hooks in a loop (Rules of Hooks) → imperative async pattern inside useEffect
 * - Schema is taken from `table.schema` (already in props) — no extra getTableById HTTP call
 * - `isCancelled` flag prevents setState after unmount / re-render
 * - `refreshKey` counter drives explicit refetch without duplicating async code
 * - `defaultDisplayField` respected when resolving relation display labels
 */
export function usePeopleData(tables: IDynamicTable[]) {
    const [aggregatedData, setAggregatedData] = useState<PersonRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [relationLookups, setRelationLookups] = useState<Record<string, Record<string, Map<string, string>>>>({});
    const [error, setError] = useState<string | null>(null);
    // Increment to trigger a refetch without changing deps reference
    const [refreshKey, setRefreshKey] = useState(0);

    // Only tables categorised as 'people'
    const peopleTables = useMemo(() => tables.filter(t => t.category === 'people'), [tables]);

    // Schema map derived synchronously from the tables prop — zero extra HTTP requests
    const schemaByTableId = useMemo((): Record<string, ITableSchema> => {
        const map: Record<string, ITableSchema> = {};
        for (const table of peopleTables) {
            // isTableSchema guard — evita cast cego em schemas malformados
            if (table.schema && isTableSchema(table.schema)) {
                map[table.id] = table.schema;
            }
        }
        return map;
    }, [peopleTables]);

    // ── Main data fetch ──────────────────────────────────────
    useEffect(() => {
        if (peopleTables.length === 0) {
            setIsLoading(false);
            setAggregatedData([]);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        (async () => {
            try {
                // 1. Fetch records for every people table in parallel
                const results: PersonRecord[] = [];
                await Promise.all(peopleTables.map(async (table) => {
                    try {
                        const res = await DynamicTableService.getTableData(table.id).catch(() => null);
                        const records = (res?.data ?? []) as RawRecord[];
                        for (const record of records) {
                            const data: Record<string, unknown> = record.data || {};
                            results.push({
                                id: record.id,
                                tableId: table.id,
                                tableName: table.name,
                                tableCategory: table.category || 'people',
                                data,
                                name: extractName(data),
                                email: extractEmail(data),
                                phone: extractPhone(data),
                                isActive: extractStatus(data),
                                role: extractRole(data),
                                avatarUrl: extractAvatar(data),
                                createdAt: record.createdAt || null,
                                tableInternalName: table.internalName || table.id,
                            });
                        }
                    } catch (e) {
                        console.error(`Error processing table ${table.name}:`, e);
                    }
                }));

                if (cancelled) return;
                results.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                setAggregatedData(results);

                // 2. Build relation lookups — respects defaultDisplayField on the target table
                const newLookups: Record<string, Record<string, Map<string, string>>> = {};
                await Promise.all(Object.entries(schemaByTableId).map(async ([tableId, schema]) => {
                    if (!schema?.fields) return;
                    type RelationField = ISchemaField & { relation: { targetTable: string } };
                    const relFields = schema.fields.filter(
                        (f): f is RelationField => f.type === 'relation' && !!(f as RelationField).relation?.targetTable
                    );
                    if (!relFields.length) return;

                    const fieldLookups: Record<string, Map<string, string>> = {};
                    await Promise.all(relFields.map(async (field) => {
                        try {
                            const body = await DynamicTableService.getTableData(field.relation.targetTable);
                            // Resolve defaultDisplayField from the target table's schema (no extra HTTP)
                            const targetTable = tables.find(t => t.id === field.relation.targetTable);
                            const targetSchema = targetTable?.schema as { defaultDisplayField?: string } | null | undefined;
                            const displayField = targetSchema?.defaultDisplayField;
                            const map = new Map<string, string>();
                            for (const row of ((body?.data ?? []) as RawRecord[])) {
                                map.set(String(row.id), formatRelatedDisplayValue(row, displayField));
                            }
                            fieldLookups[field.name] = map;
                        } catch { /* target table may not exist yet */ }
                    }));
                    newLookups[tableId] = fieldLookups;
                }));

                if (cancelled) return;
                setRelationLookups(newLookups);
            } catch (err: unknown) {
                if (!cancelled) {
                    console.error('Error fetching people data:', err);
                    setError(err instanceof Error ? err.message : 'Error loading people data');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
        // refreshKey intentionally included so `refetch()` re-triggers this effect
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peopleTables, schemaByTableId, tables, refreshKey]);

    // ── Stats ────────────────────────────────────────────────
    const stats = useMemo((): PeopleStats => {
        const byTable: Record<string, number> = {};
        let active = 0;
        let inactive = 0;
        for (const person of aggregatedData) {
            byTable[person.tableName] = (byTable[person.tableName] || 0) + 1;
            if (person.isActive) active++;
            else inactive++;
        }
        return { total: aggregatedData.length, active, inactive, byTable };
    }, [aggregatedData]);

    const tableOptions = useMemo(() => peopleTables.map(t => ({ id: t.id, name: t.name })), [peopleTables]);

    // ── Actions ──────────────────────────────────────────────
    /** Triggers a full server refetch */
    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

    const deletePerson = useCallback(async (tableId: string, personId: string): Promise<void> => {
        await DynamicTableService.deleteRecord(tableId, personId);
        refetch();
    }, [refetch]);

    const createPerson = useCallback(async (tableId: string, data: Record<string, unknown>): Promise<void> => {
        await DynamicTableService.createRecord(tableId, { data });
        refetch();
    }, [refetch]);

    return {
        people: aggregatedData,
        peopleTables,
        tableOptions,
        stats,
        isLoading,
        error,
        refetch,
        deletePerson,
        createPerson,
        schemaByTableId,
        relationLookupsByTableId: relationLookups,
        primaryTableId: peopleTables[0]?.id || '',
        primarySchema: peopleTables[0] ? schemaByTableId[peopleTables[0].id] : null,
    };
}
