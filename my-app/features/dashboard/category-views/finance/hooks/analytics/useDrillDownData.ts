'use client';

import { useState, useEffect } from 'react';
import { FinanceService } from '../../services/FinanceService';
import { IDynamicTable } from '../../../../components/shared/dynamic-tables.client';



export interface DrillDownResult {
    id: string;
    data: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

interface PaginationInfo {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
}

export function useDrillDownData(tableId?: string, recordIds?: string[], fields?: string[], page: number = 1, limit: number = 20) {
    const [data, setData] = useState<DrillDownResult[]>([]);
    const [schema, setSchema] = useState<IDynamicTable | null>(null);
    const [pagination, setPagination] = useState<PaginationInfo | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Memoize array strings to avoid complex expressions in useEffect deps
    const recordIdsStr = recordIds?.join(',') || '';
    const fieldsStr = fields?.join(',') || '';

    useEffect(() => {
        if (!tableId || !recordIds || recordIds.length === 0) {
            setData([]);
            setSchema(null);
            setPagination(null);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {

                const params = new URLSearchParams();
                params.append('tableId', tableId);
                params.append('recordIds', recordIds.join(','));
                
                if (fields && fields.length > 0) {
                    params.append('fields', fields.join(','));
                }
                params.append('page', page.toString());
                params.append('limit', limit.toString());

                const rawBody = await FinanceService.getDrillDownData(params.toString());
                const body = rawBody as { success?: boolean; data?: DrillDownResult[]; schema?: IDynamicTable; pagination?: PaginationInfo; error?: string } | null;

                if (body && body.success) {
                    setData(body.data || []);
                    setSchema(body.schema || null);
                    setPagination(body.pagination || null);
                } else {
                    throw new Error(body?.error || 'Unknown API error');
                }
            } catch (err: unknown) {
                console.error('[useDrillDownData] Error:', err);
                setError(err instanceof Error ? err.message : 'Error fetching data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [tableId, recordIdsStr, fieldsStr, page, limit]);

    return { data, schema, pagination, loading, error };
}
