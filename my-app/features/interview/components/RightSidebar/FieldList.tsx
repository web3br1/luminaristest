import React from 'react';
import FieldItem from './FieldItem';
import { ITable, ITableField } from '../../types/RightSidebarTypes';

interface FieldListProps {
  tableData: ITable;
  onToggleFieldVisibility: (index: number) => void;
}

/**
 * Componente que renderiza a lista de campos da tabela
 */
function FieldList({ tableData, onToggleFieldVisibility }: FieldListProps) {
  return (
    <div className="space-y-4">
      {tableData.fields && tableData.fields.map((field: ITableField, index: number) => (
        <FieldItem 
          key={index} 
          field={field} 
          index={index} 
          onToggleVisibility={onToggleFieldVisibility} 
        />
      ))}
    </div>
  );
}

export default FieldList;
