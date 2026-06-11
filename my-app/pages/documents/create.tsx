import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { DocumentIcon, TableCellsIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import { DocumentService } from '../../lib/services/document.service';
import { resolveErrorMessage } from '../../lib/utils/error-handler';

// Helper to format bytes into human-readable units
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type DocumentPurpose = 'DATA_ANALYSIS' | 'KNOWLEDGE_BASE';

function DocumentCreatePage() {
  const { t } = useTranslation('common');
  const router = useRouter();

  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [documentPurpose, setDocumentPurpose] = useState<DocumentPurpose>('DATA_ANALYSIS');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setTokenEstimate(null);
    const formData = new FormData();
    formData.append('file', file);
    DocumentService.getTokenCost(formData)
      .then((data) => setTokenEstimate(data.tokens))
      .catch((err) => console.error('Failed to fetch token cost:', err));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!selectedFile) {
        throw new Error('No file selected');
      }
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentPurpose', documentPurpose);
      
      await DocumentService.uploadDocument(formData);
      router.push('/documents');
    } catch (error: unknown) {
      setError(resolveErrorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-neutral-800 shadow-xl rounded-lg overflow-hidden my-10">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-500 p-6">
        <div className="flex items-center space-x-3">
          <DocumentIcon className="h-8 w-8 text-white" />
          <h1 className="text-3xl font-bold text-white">
            {t('uploadDocumentFormTitle', { defaultValue: 'Upload Document' })}
          </h1>
        </div>
        <p className="text-blue-100 mt-1 pl-11">
          Faça upload de um documento para análise e processamento pela IA
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6">
        {/* Área de escolha do propósito */}
        <div className="mb-8">
          <label className="block mb-3 font-semibold text-gray-700 dark:text-gray-200">
            Propósito do documento
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              onClick={() => setDocumentPurpose('DATA_ANALYSIS')}
              className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${documentPurpose === 'DATA_ANALYSIS' 
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' 
                : 'border-gray-200 hover:border-indigo-200 dark:border-gray-700 dark:hover:border-indigo-700'}`}
            >
              <div className={`p-2 rounded-full mr-3 ${documentPurpose === 'DATA_ANALYSIS' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-800 dark:text-indigo-200' : 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-gray-400'}`}>
                <TableCellsIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-200">Análise de Dados</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Para planilhas e tabelas que serão usadas em gráficos e análises</p>
              </div>
            </div>
            
            <div 
              onClick={() => setDocumentPurpose('KNOWLEDGE_BASE')} 
              className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${documentPurpose === 'KNOWLEDGE_BASE' 
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' 
                : 'border-gray-200 hover:border-indigo-200 dark:border-gray-700 dark:hover:border-indigo-700'}`}
            >
              <div className={`p-2 rounded-full mr-3 ${documentPurpose === 'KNOWLEDGE_BASE' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-800 dark:text-indigo-200' : 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-gray-400'}`}>
                <BookOpenIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-200">Base de Conhecimento</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Para documentos de texto que serão usados para perguntas e respostas</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Área de upload */}
        <div className="p-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg mb-6 bg-gray-50 dark:bg-neutral-900/30 hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-colors">
          <label className="flex flex-col items-center justify-center cursor-pointer">
            <DocumentIcon className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-2" />
            <span className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('selectFile', { defaultValue: 'Select Document' })}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Formatos aceitos: PDF, DOCX, XLSX
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.xlsx"
              onChange={handleFileChange}
              disabled={submitting}
              className="hidden"
            />
            <span className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              Escolher arquivo
            </span>
          </label>
        </div>
        
        {/* Detalhes do arquivo */}
        {selectedFile && (
          <div className="bg-gray-50 dark:bg-neutral-800/50 p-4 rounded-lg mb-6 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
              <DocumentIcon className="h-5 w-5 mr-2 text-indigo-500" />
              Detalhes do arquivo
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('fileName', { defaultValue: 'File Name' })}
                </label>
                <div className="text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-2">
                  {fileName}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('fileSize', { defaultValue: 'File Size' })}
                </label>
                <div className="text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-2">
                  {formatFileSize(fileSize)}
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Estimativa de tokens
              </label>
              <div className="flex items-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-2">
                <div className="flex-1 text-gray-800 dark:text-gray-200">
                  {tokenEstimate !== null ? `${tokenEstimate} tokens` : 'A calcular...'}
                </div>
                {tokenEstimate !== null && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                    Custo estimado: ${(tokenEstimate / 1000 * 0.0001).toFixed(4)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Botão de envio */}
        <button
          type="submit"
          disabled={!selectedFile || submitting}
          className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow transition duration-200 ease-in-out disabled:opacity-50 flex items-center justify-center"
        >
          {submitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t('uploading', { defaultValue: 'Uploading...' })}
            </>
          ) : (
            t('submitDocument', { defaultValue: 'Submit Document' })
          )}
        </button>
        
        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 p-3 rounded-lg text-center">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const locale = context.locale ?? 'en';
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
};

export default withAuth(DocumentCreatePage, { allowedRoles: ['USER', 'ADMIN'] }); 