import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import withAuth from '../../lib/hoc/withAuth';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import type { DocumentResponseDto } from '../../features/documents/dtos/DocumentDto';
import { DocumentIcon, TableCellsIcon, BookOpenIcon, TrashIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { CloudArrowUpIcon, DocumentTextIcon } from '@heroicons/react/24/solid';
import { DocumentService } from '../../lib/services/document.service';
import { resolveErrorMessage } from '../../lib/utils/error-handler';
import { ConfirmModal } from '../../components/ui/feedback/ConfirmModal';
import { notify } from '../../lib/notifications/notify';

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
  };
};

type ActiveTab = 'all' | 'data_analysis' | 'knowledge_base';

function DocumentListPage() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const router = useRouter();

  function handleUploadClick() {
    router.push('/documents/create');
  }

  const [documents, setDocuments] = useState<DocumentResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await DocumentService.getDocuments();
      setDocuments(data);
    } catch (e: any) {
      setError(resolveErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  async function handleDelete(docId: string) {
    setDeleting(true);
    try {
      await DocumentService.deleteDocument(docId);
      setDocuments(prev => prev.filter(doc => doc.id !== docId));
      notify(t('documentDeleted', { defaultValue: 'Documento excluído com sucesso.' }), 'success');
    } catch (error) {
      notify(t('documentDeleteError', { defaultValue: 'Erro ao excluir documento.' }), 'error');
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  const getFilteredDocuments = useCallback(() => {
    return documents.filter(doc => {
      if (activeTab === 'data_analysis' && doc.documentPurpose !== 'DATA_ANALYSIS') return false;
      if (activeTab === 'knowledge_base' && doc.documentPurpose !== 'KNOWLEDGE_BASE') return false;

      if (searchTerm.trim() !== '') {
        const searchLower = searchTerm.toLowerCase();
        return (
          doc.fileName.toLowerCase().includes(searchLower) ||
          (doc.summary && doc.summary.toLowerCase().includes(searchLower))
        );
      }

      return true;
    });
  }, [documents, activeTab, searchTerm]);

  const getDocumentsByStatus = useCallback(() => {
    const filtered = getFilteredDocuments();
    return {
      completed: filtered.filter(doc => doc.status === 'COMPLETED'),
      processing: filtered.filter(doc => doc.status === 'PROCESSING' || doc.status === 'PENDING'),
      error: filtered.filter(doc => doc.status === 'ERROR'),
    };
  }, [getFilteredDocuments]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen"><p className="text-xl">{t('loading')}</p></div>;
  }
  if (error) {
    return <div className="flex justify-center items-center min-h-screen"><p className="text-xl text-red-600">{t('errorLabel')} {error}</p></div>;
  }

  const documentsByStatus = getDocumentsByStatus();
  const totalDocuments = getFilteredDocuments().length;

  return (
    <div className="bg-gray-50 dark:bg-neutral-900 min-h-screen pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                <DocumentIcon className="h-7 w-7 mr-2 text-indigo-600 dark:text-indigo-400" />
                {t('myDocuments', { defaultValue: 'Meus Documentos' })}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('documents.subtitle', 'Manage your documents and perform analysis based on their content')}
              </p>
            </div>
            <button
              onClick={handleUploadClick}
              className="flex items-center justify-center px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all shadow-sm hover:shadow"
            >
              <PlusIcon className="h-5 w-5 mr-1" />
              {t('uploadDocument', { defaultValue: 'Upload Document' })}
            </button>
          </div>

          {/* Pesquisa e Filtros */}
          <div className="mt-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="relative flex-grow max-w-xl">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('documents.searchPlaceholder', 'Search documents...')}
                  className="pl-10 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-3 text-sm font-medium">
                <span className="text-gray-500 dark:text-gray-400">Status:</span>
                <span className="flex items-center px-2 py-1 rounded-full bg-green-100 dark:bg-green-800/30 text-green-800 dark:text-green-200">
                  <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                  {t('documents.statusCompleted', 'Completed')} ({documentsByStatus.completed.length})
                </span>
                <span className="flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-800/30 text-blue-800 dark:text-blue-200">
                  <span className="h-2 w-2 rounded-full bg-blue-500 mr-1"></span>
                  {t('documents.statusProcessing', 'Processing')} ({documentsByStatus.processing.length})
                </span>
                <span className="flex items-center px-2 py-1 rounded-full bg-red-100 dark:bg-red-800/30 text-red-800 dark:text-red-200">
                  <span className="h-2 w-2 rounded-full bg-red-500 mr-1"></span>
                  {t('status.error', 'Error')} ({documentsByStatus.error.length})
                </span>
              </div>
            </div>

            {/* Abas */}
            <div className="mt-6 border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'all'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                  {t('documents.allDocuments', 'All Documents')} ({totalDocuments})
                </button>
                <button
                  onClick={() => setActiveTab('data_analysis')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center whitespace-nowrap ${activeTab === 'data_analysis'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                  <TableCellsIcon className="h-4 w-4 mr-1" />
                  {t('documents.dataAnalysis', 'Data Analysis')}
                </button>
                <button
                  onClick={() => setActiveTab('knowledge_base')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center whitespace-nowrap ${activeTab === 'knowledge_base'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                  <BookOpenIcon className="h-4 w-4 mr-1" />
                  {t('documents.knowledgeBase', 'Knowledge Base')}
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Lista de documentos */}
        {getFilteredDocuments().length === 0 ? (
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm p-6 text-center">
            <DocumentTextIcon className="h-12 w-12 mx-auto text-gray-400" />
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {searchTerm
                ? t('documents.noResultsFiltered', 'No documents found matching the applied filters.')
                : t('documents.noDocuments', 'No documents found. Click "Upload Document" to add.')
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {getFilteredDocuments().map((doc) => (
              <div key={doc.id} className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg ${doc.documentPurpose === 'KNOWLEDGE_BASE'
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'}`}>
                        {doc.documentPurpose === 'KNOWLEDGE_BASE'
                          ? <BookOpenIcon className="h-5 w-5" />
                          : <TableCellsIcon className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white truncate max-w-xs" title={doc.fileName}>
                          {doc.fileName}
                        </h3>
                        <div className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400 space-x-2">
                          <span>{doc.fileType}</span>
                          <span>•</span>
                          <span>{Math.round(doc.fileSize / 1024)} KB</span>
                          <span>•</span>
                          <span>
                            {new Date(doc.uploadDate).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {doc.status === 'COMPLETED' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          {t('documents.statusCompleted', 'Completed')}
                        </span>
                      )}
                      {(doc.status === 'PROCESSING' || doc.status === 'PENDING') && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {t('documents.statusProcessing', 'Processing')}
                        </span>
                      )}
                      {doc.status === 'ERROR' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          {t('status.error', 'Error')}
                        </span>
                      )}
                    </div>
                  </div>

                  {doc.summary && (
                    <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                      <p className="line-clamp-2">{doc.summary}</p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-neutral-800 px-4 py-3 sm:px-6 flex justify-between items-center">
                  <button
                    onClick={() => toggleExpand(doc.id)}
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {expanded[doc.id] ? t('documents.hideDetails', 'Hide Details') : t('documents.viewDetails', 'View Details')}
                  </button>

                  <button
                    onClick={() => setConfirmDeleteId(doc.id)}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                  >
                    {t('actions.delete', 'Delete')}
                  </button>
                </div>

                {expanded[doc.id] && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700">
                    <div className="overflow-x-auto">
                      <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                        {JSON.stringify(doc, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title={t('documents.deleteTitle', 'Delete document')}
        message={t('documents.deleteMessage', 'Are you sure you want to delete this document? This will also remove its vectors and cannot be undone.')}
        confirmLabel={t('actions.delete', 'Delete')}
        cancelLabel={t('actions.cancel', 'Cancel')}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        isLoading={deleting}
        variant="danger"
      />
    </div>
  );
}

export default withAuth(DocumentListPage);
