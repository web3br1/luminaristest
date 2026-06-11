import React, { useState, useEffect } from 'react';
import { ITable, ITableField, RightSidebarProps, InteractionMode } from '../../types/RightSidebarTypes';
import FieldList from './FieldList';
import NewFieldForm from './NewFieldForm';
import AIChatMode from './AIChatMode';

/**
 * Painel lateral direito para customização de campos das tabelas
 */
function RightSidebar({ selectedTable, isVisible, sessionId, onUpdateTable, presetKey }: RightSidebarProps) {
  const [tableData, setTableData] = useState<ITable | null>(selectedTable);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [showNewFieldForm, setShowNewFieldForm] = useState<boolean>(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('manual');
  const [newField, setNewField] = useState<ITableField>({
    name: '',
    label: '',
    type: 'string',
    required: false
  });

  // Limpar o formulário de novo campo quando mudar de tabela
  useEffect(() => {
    setShowNewFieldForm(false);
    setNewField({
      name: '',
      label: '',
      type: 'string',
      required: false
    });
  }, [selectedTable]);

  // Atualizamos o estado local quando o selectedTable mudar
  useEffect(() => {
    console.log("RightSidebar: selectedTable changed:", selectedTable?.name || "null");
    console.log("RightSidebar: isVisible=", isVisible);
    
    // Log detalhado da tabela selecionada para debug
    if (selectedTable) {
      console.log("RightSidebar: Detalhes da tabela:", {
        name: selectedTable.name,
        hasFields: Boolean(selectedTable.fields),
        fieldsCount: selectedTable.fields?.length || 0,
        isCore: selectedTable.isCore
      });
      
      // Log dos campos da tabela, se existirem
      if (selectedTable.fields && selectedTable.fields.length > 0) {
        console.log("RightSidebar: Campos da tabela:", selectedTable.fields);
      } else {
        console.log("RightSidebar: A tabela não possui campos definidos.");
      }
    }
    
    setTableData(selectedTable);
    setSaveMessage(""); // Limpa mensagem de salvamento ao mudar de tabela
    
    // Definir um timeout para forçar rerender após 100ms
    setTimeout(() => {
      console.log("RightSidebar: Estado atualizado após timeout");
    }, 100);
  }, [selectedTable, isVisible]);

  // Toggle de visibilidade de um campo
  const handleToggleFieldVisibility = (index: number) => {
    if (!tableData || !tableData.fields) return;
    
    const updatedFields = [...tableData.fields];
    updatedFields[index] = {
      ...updatedFields[index],
      hidden: !updatedFields[index].hidden
    };
    
    setTableData({
      ...tableData,
      fields: updatedFields
    });
  };

  // Adiciona um novo campo
  const handleAddField = () => {
    if (!tableData) return;
    
    // Adiciona o hidden=false por padrão
    const fieldToAdd = {
      ...newField,
      hidden: false
    };
    
    const updatedFields = tableData.fields ? [...tableData.fields, fieldToAdd] : [fieldToAdd];
    
    setTableData({
      ...tableData,
      fields: updatedFields
    });
    
    // Limpa o formulário
    setNewField({
      name: '',
      label: '',
      type: 'string',
      required: false
    });
    
    setShowNewFieldForm(false);
  };

  // Salva as alterações
  const handleSave = () => {
    if (!tableData || !onUpdateTable) return;
    
    setIsSaving(true);
    
    // Atualiza o estado global através do callback
    onUpdateTable(tableData);
    
    setTimeout(() => {
      setIsSaving(false);
      setSaveMessage("Alterações salvas com sucesso!");
      
      // Limpa a mensagem após alguns segundos
      setTimeout(() => {
        setSaveMessage("");
      }, 3000);
    }, 500); // Simula um pequeno delay de processamento
  };

  // Só retornamos null se não houver tabela selecionada, caso contrário, renderizamos
  // com a classe de transformação para animação
  if (!tableData) {
    return null;
  }

  return (
    <div 
      className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ease-in-out w-[400px] md:w-[500px] ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="bg-white dark:bg-neutral-800 h-full shadow-xl flex flex-col border-l border-gray-200 dark:border-gray-700">
        {/* Cabeçalho */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Customização
            </h3>
          </div>
          
          {/* Toggle entre modos manual e IA */}
          {tableData && (
            <div className="mt-4">
              <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg flex">
                <button 
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200 ${
                    interactionMode === 'manual' 
                      ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  onClick={() => setInteractionMode('manual')}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    Manual
                  </div>
                </button>
                <button 
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200 ${
                    interactionMode === 'ai' 
                      ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  onClick={() => setInteractionMode('ai')}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z" />
                    </svg>
                    IA Humanizada
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Área de conteúdo com scroll */}
        {tableData && interactionMode === 'ai' ? (
          // Modo de IA humanizada
          <AIChatMode 
            tableData={tableData} 
            sessionId={sessionId}
            presetKey={presetKey}
            onSaveChanges={(updatedTable) => {
              if (onUpdateTable) onUpdateTable(updatedTable);
            }}
            onClose={() => setInteractionMode('manual')}
          />
        ) : (
          // Modo manual (original)
          <div className="flex-grow p-6 overflow-y-auto">
            <div className="bg-white dark:bg-neutral-800 rounded-lg">
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                    {tableData?.name} 
                    {tableData?.isCore && (
                      <span className="ml-2 text-xs text-white bg-blue-500 px-2 py-1 rounded">
                        Núcleo
                      </span>
                    )}
                  </h4>
                  
                  {!showNewFieldForm && (
                    <button 
                      onClick={() => setShowNewFieldForm(true)}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center text-sm font-medium focus:outline-none"
                    >
                      <span className="flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Novo Campo
                      </span>
                    </button>
                  )}
                </div>
                
                {showNewFieldForm && (
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="font-medium text-gray-700 dark:text-gray-200">Adicionar Novo Campo</h5>
                      <button 
                        onClick={() => setShowNewFieldForm(false)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    
                    <NewFieldForm 
                      newField={newField}
                      setNewField={setNewField}
                      onAddField={handleAddField}
                      onCancel={() => setShowNewFieldForm(false)}
                    />
                  </div>
                )}
                
                {tableData?.fields && tableData.fields.length > 0 ? (
                  <FieldList 
                    tableData={tableData}
                    onToggleFieldVisibility={handleToggleFieldVisibility} 
                  />
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Esta funcionalidade não possui campos configuráveis.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Rodapé com botão de salvar - Só aparece no modo manual */}
        {tableData && interactionMode === 'manual' && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-700">
            {saveMessage && (
              <div className="mb-3 text-sm text-center text-green-600 dark:text-green-400">
                {saveMessage}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex justify-center items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando...
                </>
              ) : "Salvar Alterações"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RightSidebar;
