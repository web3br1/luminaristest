/**
 * Common Types - Shared type definitions for the Finance module
 *
 * @description
 * Finance-specific types. Schema and record types (`SchemaField`, `TableSchema`,
 * `DynamicRecord`) are canonical type aliases of the shared types in
 * `dynamic-tables.client.ts`. This prevents two diverging contracts existing
 * in the same system — all consumers automatically use the same source of truth.
 */

import type {
    ISchemaField,
    ITableSchema,
    IDynamicTableData,
} from '../../../components/shared/dynamic-tables.client';

// ─────────────────────────────────────────────────────────────
// Schema Types — canonical aliases (no separate contracts)
// ─────────────────────────────────────────────────────────────

/** Canonical alias → ISchemaField (dynamic-tables.client) */
export type SchemaField = ISchemaField;

/** Canonical alias → ITableSchema (dynamic-tables.client) */
export type TableSchema = ITableSchema;

// ─────────────────────────────────────────────────────────────
// Record Types — canonical alias
// ─────────────────────────────────────────────────────────────

/** Canonical alias → IDynamicTableData (dynamic-tables.client) */
export type DynamicRecord = IDynamicTableData;

// ─────────────────────────────────────────────────────────────
// Finance-specific domain types (not in shared types)
// ─────────────────────────────────────────────────────────────

/** Dados de unidade de produto (estoque) */
export interface ProductUnitData {
    productId?: string;
    unitId?: string;
    stock?: number;
    reserved?: number;
    salePrice?: number;
    [key: string]: unknown;
}

/** Filtros de período comuns */
export type PeriodFilter = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'this_year';

// ─────────────────────────────────────────────────────────────
// API Types
// ─────────────────────────────────────────────────────────────

/** Resposta padrão de lista da API */
export interface ApiListResponse<T> {
    data: T[];
    total?: number;
    page?: number;
    pageSize?: number;
}

/** Resposta de erro da API */
export interface ApiErrorResponse {
    error?: string;
    message?: string;
    statusCode?: number;
}
