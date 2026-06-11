import React from 'react';
import { ITableField } from '../../types/RightSidebarTypes';

interface FieldItemProps {
  field: ITableField;
  index: number;
  onToggleVisibility: (index: number) => void;
}

/**
 * Componente responsável por renderizar um campo da tabela no painel lateral
 */
function FieldItem({ field, index, onToggleVisibility }: FieldItemProps) {
  return (
    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <h5 className="font-medium text-gray-900 dark:text-white">{field.label}</h5>
        <div className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 py-0.5 px-2 rounded">
          {field.type}
        </div>
      </div>
      
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        {field.name}
        {field.required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </div>
      
      <div className="flex items-center">
        <input
          id={`visible-field-${index}`}
          type="checkbox"
          checked={!field.hidden}
          onChange={() => onToggleVisibility(index)}
          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
        />
        <label 
          htmlFor={`visible-field-${index}`}
          className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300 cursor-pointer"
        >
          Visível
        </label>
      </div>
    </div>
  );
}

export default FieldItem;
