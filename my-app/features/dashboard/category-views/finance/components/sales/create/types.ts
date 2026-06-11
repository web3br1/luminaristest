import type { IDynamicTable } from '../../../../../components/shared/dynamic-tables.client';
import type { SchemaField, TableSchema } from '../../../types/common.types';

export type { SaleItemsVariant } from '../../../types/sales.types';
export type { SchemaField, TableSchema };

export interface StockIndexEntry {
    stock: number;
    reserved: number;
    salePrice: number;
}

export interface SalesCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    salesTable: IDynamicTable;
    saleItemsTable: IDynamicTable;
    stockIndex: Record<string, StockIndexEntry>;
    onCreated: () => void;
}
