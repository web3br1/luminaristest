import React from 'react';
import { ITable, ITableField } from '../../types/InterviewTypes';

interface ICustomizationState {
  presetKey: string;
  presetName: string;
  tables: ITable[];
}

interface LeftSidebarProps {
  customizationState: ICustomizationState | null;
  isVisible: boolean;
  onSelectTable?: (table: ITable) => void;
  selectedTableName?: string;
}

function LeftSidebar({ customizationState, isVisible, onSelectTable, selectedTableName }: LeftSidebarProps) {
  if (!customizationState) return null;

  // Componente para renderizar uma tabela no painel de customização
  function TableItem({ table }: { table: ITable }) {
    const isSelected = table.name === selectedTableName;

    return (
      <div
        className={`mb-3 p-3 ${isSelected ? 'bg-blue-50 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-700'} rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors duration-200`}
        onClick={() => onSelectTable && onSelectTable(table)}
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className={`font-semibold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
            {table.name}
          </h3>
          {table.isCore && (
            <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">
              Essencial
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{table.description}</p>
        {table.fields && table.fields.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Campos: </span>
            {table.fields
              .filter(f => !f.hidden)
              .slice(0, 3)
              .map(f => f.label)
              .join(', ')}
            {table.fields.length > 3 && ` e mais ${table.fields.length - 3}...`}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`fixed left-0 top-0 h-full z-50 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ width: '400px' }}
    >
      <div className="bg-white dark:bg-neutral-800 h-full shadow-2xl flex flex-col border-r border-gray-200 dark:border-gray-700">
        {/* Cabeçalho Fixo */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Funcionalidades do Sistema
            </h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sistema: <span className="font-semibold">{customizationState.presetName}</span>
          </p>
        </div>

        {/* Container com Scroll */}
        <div className="flex-grow overflow-y-auto p-6">
          <div className="space-y-4">
            {customizationState.tables.map((table, index) => (
              <TableItem key={index} table={table} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeftSidebar;
