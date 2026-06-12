'use client';

import { useMemo, useCallback } from 'react';
import type { IDynamicTable, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { useTableData, isTableSchema } from '../../../components/shared/dynamic-tables.client';
import { useTableRelationLookups } from '../../../shared/hooks/useTableRelationLookups';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';

const COLOR_BY_STATUS: Record<string, string> = {
    Scheduled: '#3b82f6',  // lumi-primary
    Completed: '#10b981',  // lumi-success
    'No-Show': '#f59e0b',  // lumi-warning / amber-400
    Cancelled: '#ef4444',  // lumi-danger
};

export function usePlanningData(tables: IDynamicTable[], activeTableId: string) {
    // Memoized active table — avoids re-run on every render
    const activeTable = useMemo(
        () => tables.find(t => t.id === activeTableId),
        [tables, activeTableId]
    );

    const { table: tableData, records, isLoading: isLoadingData, error, refetch } = useTableData(activeTableId || '');
    const { relationLookups, isLoadingRelations } = useTableRelationLookups(tableData, tables);

    // Event counts for sidebar
    const eventCounts = useMemo(() => {
        const counts = { scheduled: 0, completed: 0, noShow: 0, cancelled: 0 };
        if (!Array.isArray(records)) return counts;
        for (const r of records) {
            const status = String((r.data as Record<string, unknown>)?.status || 'Scheduled');
            if (status === 'Scheduled') counts.scheduled++;
            else if (status === 'Completed') counts.completed++;
            else if (status === 'No-Show') counts.noShow++;
            else if (status === 'Cancelled') counts.cancelled++;
        }
        return counts;
    }, [records]);

    // Calendar events — useMemo instead of useState+useEffect (eliminates extra render cycle)
    const events = useMemo(() => {
        if (!records || !tableData || !isTableSchema(tableData.schema) || !tableData.schema.fields.length) {
            return [];
        }
        const fields = tableData.schema.fields as ISchemaField[];
        const names = new Set(fields.map(f => f.name));
        const hasStartEnd = names.has('startAt') && names.has('endAt');
        const hasDate = names.has('date');

        return records
            .map((record: { id: string; data?: Record<string, unknown> }) => {
                const d = record?.data || {};
                let start: string | null = null;
                let end: string | null = null;
                let allDay = false;

                if (hasStartEnd) {
                    start = d.startAt ? new Date(d.startAt as string).toISOString() : null;
                    end = d.endAt ? new Date(d.endAt as string).toISOString() : null;
                } else if (hasDate) {
                    const datePart = d.date ? String(d.date).slice(0, 10) : null;
                    start = datePart ? `${datePart}T00:00:00` : null;
                    allDay = true;
                }

                // Build title with relation-resolved labels
                let title = String(d.name || '(Sem título)');
                const svcId = String(d.serviceId || '');
                const svc = svcId ? (relationLookups['serviceId']?.get(svcId) || svcId) : '';
                let customerName = '';
                const custId = String(d.customerId || '');
                if (custId) customerName = relationLookups['customerId']?.get(custId) || custId;
                if (!customerName && d.simpleCustomer && d.simpleCustomerName) customerName = String(d.simpleCustomerName);
                if (svc || customerName) title = [svc || title, customerName].filter(Boolean).join(' — ');

                const bgColor = COLOR_BY_STATUS[String(d.status || '')] || '#3b82f6';
                return { id: String(record.id), title, start: start || undefined, end: end || undefined, allDay, backgroundColor: bgColor };
            })
            .filter(ev => ev.start);
    }, [records, tableData, relationLookups]);

    // Delete delegated to hook — view stays HTTP-free
    const deleteRecord = useCallback(async (record: { id: string }) => {
        await DynamicTableService.deleteRecord(activeTableId, record.id);
        refetch();
    }, [activeTableId, refetch]);

    return {
        activeTable,
        tableData,
        records,
        isLoading: isLoadingData || isLoadingRelations,
        error,
        refetch,
        deleteRecord,
        relationLookups,
        eventCounts,
        events,
    };
}
