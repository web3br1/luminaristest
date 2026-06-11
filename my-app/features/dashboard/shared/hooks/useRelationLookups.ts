/**
 * @deprecated Legacy hook — single caller: KpiDrillDownDrawer (Finance Analytics).
 * Returns a flat Map<string,string> (incompatible with useTableRelationLookups which returns
 * Record<string, Map>). Migration requires updating TableView.tsx + KpiDrillDownDrawer.tsx.
 * Scheduled for removal during Finance Analytics audit stage.
 * DO NOT add new callers — use useTableRelationLookups instead.
 */
import { useState, useEffect } from 'react';
import type { ITableSchema, ISchemaField } from '../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';

export interface LookupRequest {
  tableId: string;
  recordIds: string[];
  displayField?: string;
}

/**
 * Hook to resolve ID-to-Name relationships for dynamic tables.
 * Takes the schema and currently displayed records, extracts foreign keys,
 * requests the Display Names from the backend in a batch,
 * and returns a single flattened Map<CUID, DisplayName> to feed into formatters.
 */
type RecordLike = { id: string; data?: Record<string, unknown> } | Record<string, unknown>;

export function useRelationLookups(schema?: ITableSchema | null, records?: RecordLike[]) {
  const [relationLookup, setRelationLookup] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!schema?.fields || !records || records.length === 0) {
      setRelationLookup(new Map());
      return;
    }

    // Identify relation-typed fields
    const relationFields = schema.fields.filter((f: ISchemaField) => f.type === 'relation' && f.relation?.targetTable);
    if (relationFields.length === 0) {
      setRelationLookup(new Map());
      return;
    }

    // Extract unique IDs for each targetTable
    const lookupRequestsMap = new Map<string, LookupRequest>();

    relationFields.forEach((field: ISchemaField) => {
      const targetTable = field.relation!.targetTable!;
      // `displayField` is an optional extension not in the canonical relation type
      const displayField = (field.relation as { targetTable?: string; displayField?: string })?.displayField;

      const recordIds = new Set<string>();

      records.forEach(record => {
        // Supports both { id, data: {...} } and flat {...} record shapes
        const flat = record as Record<string, unknown>;
        const dataPayload: Record<string, unknown> =
          (flat['data'] != null && typeof flat['data'] === 'object')
            ? flat['data'] as Record<string, unknown>
            : flat;
        const value = dataPayload[field.name];

        if (value) {
          if (Array.isArray(value)) {
            value.forEach(v => {
               if (typeof v === 'string') recordIds.add(v);
            });
          } else if (typeof value === 'string') {
            recordIds.add(value);
          }
        }
      });

      if (recordIds.size > 0) {
        if (!lookupRequestsMap.has(targetTable)) {
          lookupRequestsMap.set(targetTable, {
            tableId: targetTable,
            recordIds: Array.from(recordIds),
            displayField
          });
        } else {
          // Merge recordIds when multiple fields point to the same target table
          const existing = lookupRequestsMap.get(targetTable)!;
          Array.from(recordIds).forEach(id => existing.recordIds.push(id));
          existing.recordIds = Array.from(new Set(existing.recordIds));
        }
      }
    });

    const lookupsArray = Array.from(lookupRequestsMap.values());
    if (lookupsArray.length === 0) {
      setRelationLookup(new Map());
      return;
    }

    let isMounted = true;

    const fetchLookups = async () => {
      setIsLoading(true);
      try {
        // Legacy contract drift — the deprecated hook sends a `{ lookups: [...] }`
        // batch payload that doesn't match the service's per-table signature, but
        // matches what the runtime backend accepts. KpiDrillDownDrawer is the only
        // caller and works against production. The cast will disappear when this
        // hook is removed (see Finance Analytics audit stage).
        const body = await DynamicTableService.performLookup(
          { lookups: lookupsArray } as unknown as Parameters<typeof DynamicTableService.performLookup>[0]
        );
        if (body.success && body.data) {
            if (isMounted) {
              // Flatten the grouped backend response into a single CUID -> Name map.
              // body.data shape: Record<tableId, Record<dataId, displayValue>>
              const flatMap = new Map<string, string>();
              Object.values(body.data as Record<string, Record<string, string>>).forEach(tableValues => {
                Object.entries(tableValues).forEach(([id, name]) => {
                  flatMap.set(id, name);
                });
              });
              setRelationLookup(flatMap);
            }
          }
      } catch (error) {
        console.error('Failed to fetch relation lookups:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchLookups();

    return () => {
      isMounted = false;
    };
  }, [schema, records]);

  return { relationLookup, isLoading };
}
