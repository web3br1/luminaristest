'use client';

import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import InternalInventoryView from './InternalInventoryView';

interface InventoryViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

/**
 * InventoryView - Componente Shell (Camada 1)
 * 
 * @description
 * Atua como o container principal para a visualização de Estoque.
 * Sua única responsabilidade é receber as tabelas globais e renderizar
 * a InternalInventoryView, que fará a orquestração dos dados e lógica.
 */
export default function InventoryView({ tables, isWidgetMode = false }: InventoryViewProps) {
  return <InternalInventoryView tables={tables} isWidgetMode={isWidgetMode} />;
}
