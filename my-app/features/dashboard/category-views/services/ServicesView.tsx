'use client';

import React from 'react';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import InternalServicesView from './InternalServicesView';

interface ServicesViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

/**
 * Services view - Catalog of services offered.
 * This is the main entry point that wraps the internal high-density view.
 */
export default function ServicesView({ tables, isWidgetMode }: ServicesViewProps) {
  return <InternalServicesView tables={tables} isWidgetMode={isWidgetMode} />;
}
