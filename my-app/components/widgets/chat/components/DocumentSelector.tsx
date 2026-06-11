'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '../../../ui/Modal';

// Interface para a estrutura de um documento na lista
export interface DocumentOption {
  id: string; // ID do documento
  fileName: string; // Nome do arquivo do documento
}

interface DocumentSelectorProps {
  onSelectionChange: (selectedDocuments: DocumentOption[]) => void;
}

/**
 * Componente customizado para selecionar documentos com um botão arredondado e modal.
 */
export function DocumentSelector({ onSelectionChange }: DocumentSelectorProps) {
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Busca os documentos da API
  useEffect(() => {
    async function fetchDocuments() {
      setIsLoading(true);
      try {
        const token = (await import('cookies-next')).getCookie('auth_token');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/documents?mode=list`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Falha ao buscar documentos.');
        }
        const responseData = await response.json();
        if (!responseData.data || !Array.isArray(responseData.data)) {
          console.error('API response for documents is not an array:', responseData);
          throw new Error('Formato de dados inválido da API de documentos.');
        }
        setDocuments(responseData.data);
      } catch (err: any) {
        setError(err.message || 'Ocorreu um erro desconhecido ao buscar documentos.');
        setDocuments([]); // Garante que documents seja um array em caso de erro
      }
      setIsLoading(false);
    }
    fetchDocuments();
  }, []);



  // Lida com a mudança de seleção de um checkbox
  function handleCheckboxChange(documentId: string) {
    setSelectedDocumentIds(prevSelectedIds => {
      const newSelectedIds =
        prevSelectedIds.includes(documentId)
          ? prevSelectedIds.filter(id => id !== documentId)
          : [...prevSelectedIds, documentId];

      // Notifica o componente pai com os objetos DocumentOption completos
      const selectedDocs = documents.filter(doc => newSelectedIds.includes(doc.id));
      onSelectionChange(selectedDocs);

      return newSelectedIds;
    });
  }

  function openModal() {
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  return (
    <>
      {/* Botão arredondado com contador */}
      <div className="relative">
        <button
          type="button"
          onClick={openModal}
          className="relative inline-flex items-center justify-center w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          aria-label="Selecionar documentos"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          
          {/* Contador de documentos selecionados */}
          {selectedDocumentIds.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-medium">
              {selectedDocumentIds.length}
            </span>
          )}
        </button>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Selecionar Documentos"
        maxWidth="max-w-md"
      >
        <div className="p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-500 dark:text-gray-400">Carregando...</span>
            </div>
          )}
          
          {error && (
            <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {error}
            </div>
          )}
          
          {!isLoading && !error && documents.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Nenhum documento encontrado.</p>
            </div>
          )}
          
          {!isLoading && !error && documents.length > 0 && (
            <div className="space-y-2">
              {documents.map(doc => (
                <label 
                  key={doc.id} 
                  className="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedDocumentIds.includes(doc.id)}
                    onChange={() => handleCheckboxChange(doc.id)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-offset-gray-800 dark:bg-neutral-900 dark:border-gray-600"
                  />
                  <span className="ml-3 text-sm text-gray-700 dark:text-gray-200 truncate">
                    {doc.fileName}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer do Modal */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {selectedDocumentIds.length} documento(s) selecionado(s)
          </span>
          <button
            onClick={closeModal}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </Modal>
    </>
  );
}
