import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { getCookie } from 'cookies-next';
import { IMessage, ICustomizationState } from '../types/InterviewTypes';
import { ITable } from '../types/RightSidebarTypes';

export function useAiInterview() {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('GREETING');
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [customizationState, setCustomizationState] = useState<ICustomizationState | null>(null);
  const [showCustomizationPanel, setShowCustomizationPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [selectedTable, setSelectedTable] = useState<ITable | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchInitialMessage() {
      setIsLoading(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard/ai/ChatInterview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [], stage: 'GREETING' })
        });
        const data = await response.json();
        if (data.response) {
          setMessages([{ sender: 'ai', text: data.response }]);
          setCurrentStage(data.nextStage);
        }
      } catch (error) {
        console.error('Failed to fetch initial message:', error);
        setMessages([{ sender: 'ai', text: 'Olá! Houve um problema ao iniciar. Por favor, recarregue a página.' }]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchInitialMessage();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const logState = () => {
    console.log({
      stage: currentStage,
      messages,
      customizationState,
      isCreating,
      creationError,
      selectedTable,
      showLeftPanel: showCustomizationPanel,
      showRightPanel
    });
  };

  async function handleCreateSystem(key: string) {
    setIsCreating(true);
    setCreationError(null);
    try {
      const token = getCookie('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ suiteKey: key }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Não foi possível criar o sistema.' }));
        throw new Error(errorData.error || 'Ocorreu uma falha ao criar seu dashboard.');
      }
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);

    } catch (err) {
      setCreationError((err instanceof Error ? err.message : String(err)) || 'Ocorreu um erro inesperado.');
      setIsCreating(false);
    }
  }

  async function handleSendMessage() {
    if (userInput.trim() === '' || isLoading || isCreating) return;

    const userMessage: IMessage = { sender: 'user', text: userInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard/ai/ChatInterview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages, 
          stage: currentStage, 
          presetKey: presetKey,
          sessionId: sessionId
        })
      });

      if (!response.ok) throw new Error('Failed to get response from AI');

      const result = await response.json();
      const { response: aiResponse, nextStage, presetKey: newPresetKey, sessionId: newSessionId, startCustomization, customizationState: newCustomizationState } = result;

      setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
      setCurrentStage(nextStage);

      if (newPresetKey) {
        setPresetKey(newPresetKey);
      }
      
      if (newSessionId) {
        setSessionId(newSessionId);
      }
      
      if (newCustomizationState) {
        setCustomizationState(newCustomizationState);
        setShowCustomizationPanel(true);
      }

      if (nextStage === 'COMPLETED' && (newPresetKey || presetKey)) {
        if (!startCustomization) {
          handleCreateSystem(newPresetKey || presetKey!);
        }
      }

    } catch (error) {
      console.error('Failed to get response from AI:', error);
      setMessages(prev => [...prev, { sender: 'ai', text: 'Desculpe, ocorreu um erro de comunicação.' }]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSelectTable = (table: ITable) => {
    const tableWithKeysAndFields = {
      ...table,
      // Ensure key property exists, using name as fallback if needed
      key: table.key || table.name,
      fields: table.fields || []
    };
    setSelectedTable(tableWithKeysAndFields);
    setShowRightPanel(true);
  };

  const handleUpdateTable = (updatedTable: ITable) => {
    if (!customizationState) return;

    // Ensure the updatedTable has all required properties including key
    // If key doesn't exist, use the name as a fallback
    const tableWithKey = {
      ...updatedTable,
      key: updatedTable.key || updatedTable.name
    };

    const updatedTables = customizationState.tables.map(table => 
      table.name === tableWithKey.name ? tableWithKey : table
    );

    setCustomizationState({
      ...customizationState,
      tables: updatedTables
    });

    setSelectedTable(tableWithKey);
  };

  const handleRetry = () => {
    window.location.reload();
  }

  return {
    messages,
    userInput,
    setUserInput,
    isLoading,
    isCreating,
    creationError,
    customizationState,
    showCustomizationPanel,
    setShowCustomizationPanel,
    showRightPanel,
    setShowRightPanel,
    selectedTable,
    chatEndRef,
    inputRef,
    sessionId,
    handleSendMessage,
    handleSelectTable,
    handleUpdateTable,
    logState,
    handleRetry,
    presetKey
  };
}
