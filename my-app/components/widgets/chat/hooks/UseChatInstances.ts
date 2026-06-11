import { useState, useCallback, useEffect } from 'react';
import { ChatInstanceSummary } from '../types/chat.types';

/**
 * Props para o hook useChatInstances.
 */
interface UseChatInstancesProps {
  /** ID da instância do widget atualmente ativa (para filtrar da lista do modal). */
  currentWidgetInstanceId: string | null;
  /** Callback invocado quando o usuário seleciona uma instância de chat do modal. */
  onSelectChatInstance: (widgetInstanceId: string) => void;
  /** ID da instância do widget (opcional), usado para logs consistentes. */
  widgetInstanceIdForLogging?: string;
  // Callback to inform ChatWidget if the active instance was deleted, so it can reset
  onActiveInstanceDeleted?: () => void;
}

/**
 * Valores retornados pelo hook useChatInstances.
 */
interface UseChatInstancesReturn {
  /** Array de todas as instâncias de chat disponíveis para o usuário (para popular o modal). */
  allChatInstances: ChatInstanceSummary[];
  /** Booleano indicando se o dropdown está atualmente aberto/visível. */
  isDropdownOpen: boolean;
  /** Booleano indicando se a lista de instâncias de chat está sendo carregada. */
  isLoadingInstances: boolean;
  /** Mensagem de erro se a busca das instâncias de chat falhou. Null caso contrário. */
  loadInstancesError: string | null;
  /** Função para alternar a visibilidade do dropdown (abrir/fechar). */
  toggleDropdown: () => void;
  /** Função chamada quando uma instância é selecionada no dropdown. Invoca `onSelectChatInstance`. */
  handleSelectInstance: (selectedWidgetInstanceId: string) => void;

  // Função para buscar as instâncias de chat do servidor
  fetchInstances: () => Promise<void>;

  // Function to initiate a new chat
  handleInitiateNewChat: () => void;

  // For delete confirmation
  instanceIdPendingDelete: string | null;
  isDeletingInstance: boolean;
  deleteInstanceError: string | null;
  requestDeleteConfirmation: (instanceId: string) => void;
  cancelDeleteConfirmation: () => void;
  confirmDeleteInstance: (instanceId: string) => Promise<void>;
}

/**
 * Hook customizado para gerenciar a funcionalidade de um modal de seleção de instâncias de chat.
 * Responsabilidades:
 * - Buscar a lista de todas as instâncias de chat disponíveis para o usuário.
 * - Controlar o estado de visibilidade do modal (aberto/fechado).
 * - Lidar com a seleção de uma instância no modal e invocar um callback.
 * - Gerenciar os estados de carregamento e erro da busca de instâncias.
 */
export function useChatInstances({
  currentWidgetInstanceId,
  onSelectChatInstance,
  widgetInstanceIdForLogging,
  onActiveInstanceDeleted,
}: UseChatInstancesProps): UseChatInstancesReturn {
  const [allChatInstances, setAllChatInstances] = useState<ChatInstanceSummary[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isLoadingInstances, setIsLoadingInstances] = useState<boolean>(false);
  const [loadInstancesError, setLoadInstancesError] = useState<string | null>(null);

  // State for delete functionality
  const [instanceIdPendingDelete, setInstanceIdPendingDelete] = useState<string | null>(null);
  const [isDeletingInstance, setIsDeletingInstance] = useState<boolean>(false);
  const [deleteInstanceError, setDeleteInstanceError] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    setIsLoadingInstances(true);
    setLoadInstancesError(null);
    try {
      const { getCookie } = await import('cookies-next');
      const token = getCookie('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances`, { 
        headers: { 'Authorization': `Bearer ${token}` },
        // credentials: 'include' 
      });
      if (!response.ok) throw new Error(`Falha ao buscar lista de chats (status ${response.status})`);
      const json = await response.json();
      setAllChatInstances(json.data);
    } catch (error: unknown) {
      setLoadInstancesError(error instanceof Error ? error.message : 'Erro ao carregar chats.');
    }
    setIsLoadingInstances(false);
  }, []);

  useEffect(() => {
    if (isDropdownOpen) { // Fetch instances when dropdown is opened
        fetchInstances();
    }
  }, [isDropdownOpen, fetchInstances]);
  
  // Initial fetch if required when hook mounts (optional, depends on UX)
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  /**
   * Alterna o estado de visibilidade (aberto/fechado) do dropdown.
   */
  const toggleDropdown = useCallback(() => {
    setIsDropdownOpen(prev => !prev);
    if (!isDropdownOpen) { // Reset delete states when opening dropdown
        setInstanceIdPendingDelete(null);
        setDeleteInstanceError(null);
    }
  }, [isDropdownOpen]);

  /**
   * Chamado quando um usuário seleciona uma instância de chat no dropdown.
   * Invoca o callback `onSelectChatInstance` e fecha o dropdown.
   */
  const handleSelectInstance = useCallback((selectedWidgetInstanceId: string) => {
    if (selectedWidgetInstanceId === currentWidgetInstanceId) {
      setIsDropdownOpen(false);
      return;
    }
    onSelectChatInstance(selectedWidgetInstanceId);
    setIsDropdownOpen(false);
  }, [currentWidgetInstanceId, onSelectChatInstance]);

  const handleInitiateNewChat = useCallback(async () => {
    // Generate a unique widgetInstanceId for the new chat and initiate it
    const newWidgetInstanceId = `new-chat-${Date.now()}`;
    onSelectChatInstance(newWidgetInstanceId);
    setIsDropdownOpen(false); // Close the dropdown after initiating the new chat
    // Refresh the list to include the newly created chat instance
    try {
      await fetchInstances();
    } catch (_) {
      // Ignore errors in refreshing
    }
  }, [onSelectChatInstance, setIsDropdownOpen, fetchInstances]);

  // Delete related functions
  const requestDeleteConfirmation = useCallback((instanceId: string) => {
    setInstanceIdPendingDelete(instanceId);
    setDeleteInstanceError(null); // Clear previous delete error
  }, []);

  const cancelDeleteConfirmation = useCallback(() => {
    setInstanceIdPendingDelete(null);
  }, []);

  const confirmDeleteInstance = useCallback(async (instanceId: string) => {
    setIsDeletingInstance(true);
    setDeleteInstanceError(null);
    try {
      const { getCookie } = await import('cookies-next');
      const token = getCookie('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances/${instanceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        // credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error
        throw new Error(errorData.message || `Failed to delete chat instance (status ${response.status})`);
      }
      setInstanceIdPendingDelete(null);
      await fetchInstances(); // Refresh the list

      // If the deleted instance was the currently active one in the widget, inform parent
      if (instanceId === currentWidgetInstanceId && onActiveInstanceDeleted) {
        onActiveInstanceDeleted();
      }

    } catch (error: unknown) {
      setDeleteInstanceError(error instanceof Error ? error.message : 'Error deleting chat instance.');
    }
    setIsDeletingInstance(false);
  }, [fetchInstances, currentWidgetInstanceId, onActiveInstanceDeleted]);

  return {
    allChatInstances,
    isDropdownOpen,
    isLoadingInstances,
    loadInstancesError,
    toggleDropdown,
    handleSelectInstance,
    fetchInstances,
    handleInitiateNewChat,
    instanceIdPendingDelete,
    isDeletingInstance,
    deleteInstanceError,
    requestDeleteConfirmation,
    cancelDeleteConfirmation,
    confirmDeleteInstance,
  };
} 