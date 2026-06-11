import React from 'react';
import { ITableField } from '../../types/RightSidebarTypes';

interface NewFieldFormProps {
  newField: ITableField;
  setNewField: React.Dispatch<React.SetStateAction<ITableField>>;
  onAddField: () => void;
  onCancel: () => void;
}

/**
 * Componente de formulário para adição de novo campo
 */
function NewFieldForm({ newField, setNewField, onAddField, onCancel }: NewFieldFormProps) {
  return (
    <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow mb-4">
      <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
        Adicionar Novo Campo
      </h4>
      
      <div className="space-y-3">
        <div>
          <label 
            htmlFor="field-name" 
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Nome Técnico
          </label>
          <input
            id="field-name"
            type="text"
            value={newField.name}
            onChange={(e) => setNewField({ ...newField, name: e.target.value })}
            placeholder="Ex: customerName"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:border-gray-600 dark:text-white"
          />
        </div>
        
        <div>
          <label 
            htmlFor="field-label" 
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Rótulo
          </label>
          <input
            id="field-label"
            type="text"
            value={newField.label}
            onChange={(e) => setNewField({ ...newField, label: e.target.value })}
            placeholder="Ex: Nome do Cliente"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:border-gray-600 dark:text-white"
          />
        </div>
        
        <div>
          <label 
            htmlFor="field-type" 
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Tipo de Dado
          </label>
          <select
            id="field-type"
            value={newField.type}
            onChange={(e) => setNewField({ ...newField, type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-800 dark:border-gray-600 dark:text-white"
          >
            <option value="string">Texto</option>
            <option value="number">Número</option>
            <option value="boolean">Sim/Não</option>
            <option value="date">Data</option>
            <option value="datetime">Data e Hora</option>
            <option value="email">E-mail</option>
            <option value="password">Senha</option>
            <option value="phone">Telefone</option>
          </select>
        </div>
        
        <div className="flex items-center">
          <input
            id="field-required"
            type="checkbox"
            checked={newField.required}
            onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label 
            htmlFor="field-required"
            className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Campo obrigatório
          </label>
        </div>
        
        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onAddField}
            disabled={!newField.name || !newField.label}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewFieldForm;
