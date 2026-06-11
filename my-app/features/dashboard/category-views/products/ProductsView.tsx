'use client';

import React from 'react';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import InternalProductsView from './InternalProductsView';

interface ProductsViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

/**
 * Products view - Catalog of products with inventory by business unit.
 * This is the main entry point that wraps the internal high-density view.
 */
export default function ProductsView({ tables, isWidgetMode }: ProductsViewProps) {
  return <InternalProductsView tables={tables} isWidgetMode={isWidgetMode} />;
}
