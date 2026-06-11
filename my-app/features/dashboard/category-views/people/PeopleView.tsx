'use client';

import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import InternalPeopleView from './InternalPeopleView';

interface PeopleViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

/**
 * PeopleView - Componente Shell (Camada 1)
 * 
 * @description
 * Atua como o container principal para a visualização de Pessoas.
 * Sua única responsabilidade é receber as tabelas globais e renderizar
 * a InternalPeopleView, que fará a orquestração dos dados.
 */
export function PeopleView({ tables, isWidgetMode = false }: PeopleViewProps) {
  return <InternalPeopleView tables={tables} isWidgetMode={isWidgetMode} />;
}
