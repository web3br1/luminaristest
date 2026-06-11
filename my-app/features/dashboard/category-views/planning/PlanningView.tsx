'use client';

import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import InternalPlanningView from './InternalPlanningView';

interface PlanningViewProps {
    tables: IDynamicTable[];
    isWidgetMode?: boolean;
}

/**
 * PlanningView - Componente Shell (Camada 1)
 * 
 * @description
 * Atua como o container principal para a visualização de Planejamento.
 * Sua única responsabilidade é receber as tabelas globais e renderizar
 * a InternalPlanningView, que fará a orquestração dos dados e lógica.
 */
export default function PlanningView({ tables, isWidgetMode = false }: PlanningViewProps) {
    return <InternalPlanningView tables={tables} isWidgetMode={isWidgetMode} />;
}
