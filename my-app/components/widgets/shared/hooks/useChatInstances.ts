import { useState, useCallback, useEffect } from 'react';

export interface ChatInstanceSummary {
    id: string;
    widgetInstanceId: string;
    title: string | null;
    type?: 'DOCUMENT' | 'GENERIC';
    createdAt: string;
    updatedAt: string;
}

/**
 * Props para o hook useChatInstances.
 */
export interface UseChatInstancesProps {
    /** Tipo de chat para filtrar: DOCUMENT ou GENERIC */
    chatType: 'DOCUMENT' | 'GENERIC';
    /** ID da instância do widget atualmente ativa */
    currentWidgetInstanceId: string | null;
    /** Callback invocado quando o usuário seleciona uma instância */
    onSelectChatInstance: (widgetInstanceId: string) => void;
    /** Callback when the active instance was deleted */
    onActiveInstanceDeleted?: () => void;
}

/**
 * Valores retornados pelo hook useChatInstances.
 */
export interface UseChatInstancesReturn {
    allChatInstances: ChatInstanceSummary[];
    isDropdownOpen: boolean;
    isLoadingInstances: boolean;
    loadInstancesError: string | null;
    toggleDropdown: () => void;
    handleSelectInstance: (selectedWidgetInstanceId: string) => void;
    fetchInstances: () => Promise<void>;
    handleInitiateNewChat: () => void;
    // Delete
    instanceIdPendingDelete: string | null;
    isDeletingInstance: boolean;
    deleteInstanceError: string | null;
    requestDeleteConfirmation: (instanceId: string) => void;
    cancelDeleteConfirmation: () => void;
    confirmDeleteInstance: (instanceId: string) => Promise<void>;
    // Rename
    instanceIdBeingRenamed: string | null;
    isRenamingInstance: boolean;
    renameInstanceError: string | null;
    startRename: (instanceId: string) => void;
    cancelRename: () => void;
    confirmRename: (instanceId: string, newTitle: string) => Promise<void>;
}

const LAST_CHAT_COOKIE_KEY = 'floating_chat_last_instance';

/**
 * Hook compartilhado para gerenciar dropdown de instâncias de chat.
 * Filtra por tipo (DOCUMENT ou GENERIC).
 */
export function useChatInstances({
    chatType,
    currentWidgetInstanceId,
    onSelectChatInstance,
    onActiveInstanceDeleted,
}: UseChatInstancesProps): UseChatInstancesReturn {
    const [allChatInstances, setAllChatInstances] = useState<ChatInstanceSummary[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const [isLoadingInstances, setIsLoadingInstances] = useState<boolean>(false);
    const [loadInstancesError, setLoadInstancesError] = useState<string | null>(null);

    // Delete state
    const [instanceIdPendingDelete, setInstanceIdPendingDelete] = useState<string | null>(null);
    const [isDeletingInstance, setIsDeletingInstance] = useState<boolean>(false);
    const [deleteInstanceError, setDeleteInstanceError] = useState<string | null>(null);

    // Rename state
    const [instanceIdBeingRenamed, setInstanceIdBeingRenamed] = useState<string | null>(null);
    const [isRenamingInstance, setIsRenamingInstance] = useState<boolean>(false);
    const [renameInstanceError, setRenameInstanceError] = useState<string | null>(null);

    const fetchInstances = useCallback(async () => {
        setIsLoadingInstances(true);
        setLoadInstancesError(null);
        try {
            const { getCookie } = await import('cookies-next');
            const token = getCookie('auth_token');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances?type=${chatType}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(`Falha ao buscar lista de chats (status ${response.status})`);
            const json = await response.json();
            setAllChatInstances(json.data || []);
        } catch (error: unknown) {
            setLoadInstancesError(error instanceof Error ? error.message : 'Erro ao carregar chats.');
        }
        setIsLoadingInstances(false);
    }, [chatType]);

    useEffect(() => {
        if (isDropdownOpen) {
            fetchInstances();
        }
    }, [isDropdownOpen, fetchInstances]);

    useEffect(() => {
        fetchInstances();
    }, [fetchInstances]);

    // Save last active chat to cookie when it changes
    useEffect(() => {
        if (currentWidgetInstanceId && !currentWidgetInstanceId.startsWith('new-')) {
            import('cookies-next').then(({ setCookie }) => {
                setCookie(LAST_CHAT_COOKIE_KEY, currentWidgetInstanceId, {
                    maxAge: 60 * 60 * 24 * 30, // 30 days
                    path: '/',
                });
            });
        }
    }, [currentWidgetInstanceId]);

    const toggleDropdown = useCallback(() => {
        setIsDropdownOpen(prev => !prev);
        if (!isDropdownOpen) {
            setInstanceIdPendingDelete(null);
            setDeleteInstanceError(null);
            setInstanceIdBeingRenamed(null);
            setRenameInstanceError(null);
        }
    }, [isDropdownOpen]);

    const handleSelectInstance = useCallback((selectedWidgetInstanceId: string) => {
        if (selectedWidgetInstanceId === currentWidgetInstanceId) {
            setIsDropdownOpen(false);
            return;
        }
        onSelectChatInstance(selectedWidgetInstanceId);
        setIsDropdownOpen(false);
    }, [currentWidgetInstanceId, onSelectChatInstance]);

    const handleInitiateNewChat = useCallback(async () => {
        const newWidgetInstanceId = `new-${chatType.toLowerCase()}-chat-${Date.now()}`;
        onSelectChatInstance(newWidgetInstanceId);
        setIsDropdownOpen(false);
        try {
            await fetchInstances();
        } catch (_) {
            // Ignore errors in refreshing
        }
    }, [chatType, onSelectChatInstance, fetchInstances]);

    // DELETE functions
    const requestDeleteConfirmation = useCallback((instanceId: string) => {
        setInstanceIdPendingDelete(instanceId);
        setDeleteInstanceError(null);
    }, []);

    const cancelDeleteConfirmation = useCallback(() => {
        setInstanceIdPendingDelete(null);
    }, []);

    const confirmDeleteInstance = useCallback(async (instanceId: string) => {
        setIsDeletingInstance(true);
        setDeleteInstanceError(null);
        try {
            const { getCookie, deleteCookie } = await import('cookies-next');
            const token = getCookie('auth_token');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances/${instanceId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Failed to delete chat instance (status ${response.status})`);
            }
            setInstanceIdPendingDelete(null);

            // Clear cookie if deleting the saved instance
            const savedInstance = getCookie(LAST_CHAT_COOKIE_KEY);
            if (savedInstance === instanceId) {
                deleteCookie(LAST_CHAT_COOKIE_KEY);
            }

            await fetchInstances();

            if (instanceId === currentWidgetInstanceId && onActiveInstanceDeleted) {
                onActiveInstanceDeleted();
            }
        } catch (error: unknown) {
            setDeleteInstanceError(error instanceof Error ? error.message : 'Error deleting chat instance.');
        }
        setIsDeletingInstance(false);
    }, [fetchInstances, currentWidgetInstanceId, onActiveInstanceDeleted]);

    // RENAME functions
    const startRename = useCallback((instanceId: string) => {
        setInstanceIdBeingRenamed(instanceId);
        setRenameInstanceError(null);
    }, []);

    const cancelRename = useCallback(() => {
        setInstanceIdBeingRenamed(null);
        setRenameInstanceError(null);
    }, []);

    const confirmRename = useCallback(async (instanceId: string, newTitle: string) => {
        setIsRenamingInstance(true);
        setRenameInstanceError(null);
        try {
            const { getCookie } = await import('cookies-next');
            const token = getCookie('auth_token');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances/${instanceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title: newTitle.trim() || null }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Failed to rename chat instance (status ${response.status})`);
            }
            setInstanceIdBeingRenamed(null);
            await fetchInstances();
        } catch (error: unknown) {
            setRenameInstanceError(error instanceof Error ? error.message : 'Error renaming chat instance.');
        }
        setIsRenamingInstance(false);
    }, [fetchInstances]);

    return {
        allChatInstances,
        isDropdownOpen,
        isLoadingInstances,
        loadInstancesError,
        toggleDropdown,
        handleSelectInstance,
        fetchInstances,
        handleInitiateNewChat,
        // Delete
        instanceIdPendingDelete,
        isDeletingInstance,
        deleteInstanceError,
        requestDeleteConfirmation,
        cancelDeleteConfirmation,
        confirmDeleteInstance,
        // Rename
        instanceIdBeingRenamed,
        isRenamingInstance,
        renameInstanceError,
        startRename,
        cancelRename,
        confirmRename,
    };
}

// Helper to get last chat instance from cookie
export async function getLastChatInstanceId(): Promise<string | null> {
    try {
        const { getCookie } = await import('cookies-next');
        const value = getCookie(LAST_CHAT_COOKIE_KEY);
        return typeof value === 'string' ? value : null;
    } catch {
        return null;
    }
}
