/**
 * Sales Types - Type definitions for sales module
 * 
 * @description
 * Tipos específicos para vendas, itens de venda e wizard de criação.
 */

// ─────────────────────────────────────────────────────────────
// Variant Types
// ─────────────────────────────────────────────────────────────

/** Tipos de variante de itens de venda */
export type SaleItemsVariant = 'products' | 'services' | 'mixed';

// ─────────────────────────────────────────────────────────────
// Sale Record Types
// ─────────────────────────────────────────────────────────────

/** Dados de um registro de venda */
export interface SaleData {
    date?: string;
    status?: string;
    paymentStatus?: string;
    totalAmount?: number;
    subtotal?: number;
    discountAmount?: number;
    customerId?: string;
    unitId?: string;
    simpleCustomer?: boolean;
    simpleCustomerName?: string;
    paymentMethod?: string;
    paymentTermDays?: number;
    notes?: string;
    [key: string]: unknown;
}

/** Registro de venda completo */
export type SaleRecord = SaleData & { id: string };

/** Dados de um item de venda */
export interface SaleItemData {
    saleId?: string;
    productId?: string;
    serviceId?: string;
    type?: 'Product' | 'Service';
    itemType?: 'Product' | 'Service';
    quantity?: number;
    unitPrice?: number;
    commission?: number;
    responsibleEmployeeId?: string;
    appointmentId?: string;
    description?: string;
    [key: string]: unknown;
}

/** Registro de item de venda completo */
export type SaleItemRecord = SaleItemData & { id: string };

// ─────────────────────────────────────────────────────────────
// Wizard Types
// ─────────────────────────────────────────────────────────────

/** Item temporário no wizard de criação de venda */
export interface NewSaleItem {
    id: string; // ID temporário para gerenciamento no wizard
    itemType?: 'Product' | 'Service';
    productId?: string;
    serviceId?: string;
    quantity?: number;
    unitPrice?: number;
    commission?: number;
    responsibleEmployeeId?: string;
    appointmentId?: string;
    withAppointment?: boolean;
    selectedTime?: string;
    selectedDate?: string;
    description?: string;
    // Computed/cached values
    stockAvailable?: number;
    productName?: string;
    serviceName?: string;
}

/** Estado completo do wizard de criação de venda */
export interface SalesWizardState {
    // Header
    date: string;
    customerId: string;
    unitId: string;
    notes: string;
    simpleCustomer: boolean;
    simpleCustomerName: string;
    paymentMethod: string;
    paymentTermDays: number;
    discountAmount: number;
    variant: 'products' | 'services'; // User-selected item type (for mixed schemas)
    // Items
    items: NewSaleItem[];
    // UI State
    isSubmitting: boolean;
    error: string | null;
}

// ─────────────────────────────────────────────────────────────
// Analytics Types
// ─────────────────────────────────────────────────────────────

/** Resultado de analytics de vendas */
export interface SalesAnalytics {
    statusCounts: Record<string, number>;
    paidTotal: number;
    receivableTotal: number;
    monthly: Record<string, number>;
    stockUnitsUsed: number;
    saleIdToSubtotal: Record<string, number>;
    draftFinalData: Array<{ name: string; value: number }>;
    paymentBreakdownData: Array<{ name: string; value: number }>;
    amountsData: Array<{ name: string } & Record<string, number | string>>;
}

// ─────────────────────────────────────────────────────────────
// Relation Maps
// ─────────────────────────────────────────────────────────────

/** Mapas de lookup para relações */
export interface RelationMaps {
    productNameMap: Record<string, string>;
    serviceNameMap: Record<string, string>;
    customerNameMap: Record<string, string>;
    unitNameMap: Record<string, string>;
    isLoading: boolean;
}
