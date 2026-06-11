import React, { useState, useRef, useEffect } from 'react';
import { getCookie } from 'cookies-next';
import { IAiMessage, ITable } from '../../types/RightSidebarTypes';

interface AIChatModeProps {
  tableData: ITable;
  sessionId: string | null;
  onSaveChanges: (updatedTable: ITable) => void;
  onClose: () => void;
  presetKey: string | null;
}

/**
 * Componente de interação humanizada com IA para customização de tabelas
 */
function AIChatMode({ tableData, sessionId: externalSessionId, onSaveChanges, onClose, presetKey }: AIChatModeProps) {
  const [messages, setMessages] = useState<IAiMessage[]>(() => {
    if (tableData.conversationHistory && tableData.conversationHistory.length > 0) {
      return tableData.conversationHistory.map(msg => ({ ...msg, timestamp: new Date(msg.timestamp) }));
    }
    return [
      {
        role: 'system',
        content: 'Bem-vindo à personalização inteligente!',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: `Olá! Estou aqui para ajudar você a personalizar a funcionalidade **${tableData.name}**.\n\nMe conte quais informações você precisa guardar e quais você acha desnecessárias. Você pode usar suas próprias palavras, como:\n\n• "Preciso guardar o endereço completo dos clientes"\n• "Não preciso anotar o telefone das pessoas"\n• "Quero registrar a data de nascimento também"\n• "Não sei o que preciso guardar para uma empresa"\n\nVocê não precisa se preocupar com termos técnicos, apenas me diga o que precisa guardar com suas próprias palavras!`,
        timestamp: new Date(),
      },
    ];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [internalSessionId, setInternalSessionId] = useState<string | null>(externalSessionId || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // O sessionId efetivo é o externo (se fornecido) ou o interno (de estado)
  const sessionId = externalSessionId || internalSessionId;



  // Rolar para o final da conversa quando novas mensagens chegarem
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Função para processar os dados da resposta da API
  const processApiResponse = (data: any) => {
    // Atualizar sessionId se a API retornar um novo
    if (data.sessionId) {
      setInternalSessionId(data.sessionId);
      console.log(`[AIChatMode] Sessão atualizada: ${data.sessionId}`);
    }
    
    // Atualizar o histórico de mensagens com os dados da API
    if (data.conversationHistory) {
      const historyWithDates = data.conversationHistory.map((msg: IAiMessage) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      setMessages(historyWithDates);
    }
    
    // Se a tabela foi modificada, atualize-a
    if (data.modified) {
      onSaveChanges(data.table);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Adicionar mensagem do usuário
    const userMessage: IAiMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsSending(true);

    try {
      // Converter o formato das mensagens para o formato esperado pela API
      const conversationHistory = updatedMessages
        .filter(msg => msg.role !== 'system') // Remover mensagens do sistema
        .map(msg => ({
          role: msg.role === 'assistant' ? 'ai' : 'user',
          content: msg.content
        }));
      
      // Chamar a API de customização de campos
      const token = getCookie('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard/ai/CustomizeFields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${String(token)}` } : {}),
        },
        body: JSON.stringify({
          sessionId: sessionId, // Envia o sessionId atual, pode ser null na primeira chamada
          tableKey: tableData.key,
          userMessage: inputMessage,
          conversationHistory
        })
      });

      // Se a sessão não for encontrada, exibe uma mensagem de erro clara
      if (response.status === 404) {
        console.warn('[AIChatMode] Sessão não encontrada (404). O backend pode ter reiniciado. Adicionando mensagem de erro para o usuário.');
        throw new Error('Sua sessão expirou. Por favor, tente enviar sua mensagem novamente.');
      }
      
      if (!response.ok) {
        throw new Error(`Falha ao obter resposta da IA: ${response.status}`);
      }

      const data = await response.json();
      processApiResponse(data);
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      
      // Adicionar mensagem de erro
      const errorMessage: IAiMessage = {
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.',
        timestamp: new Date(),
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFinishCustomization = async () => {
    setIsSending(true);
    try {
      const userMessage: IAiMessage = {
        role: 'user',
        content: 'Finalizar customização',
        timestamp: new Date(),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);

      const conversationHistory = updatedMessages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'ai' : 'user',
          content: msg.content,
        }));

      if (!sessionId) {
        throw new Error('Sessão inválida. Por favor, tente enviar uma mensagem primeiro.');
      }

      const token = getCookie('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard/ai/CustomizeFields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${String(token)}` } : {}),
        },
        body: JSON.stringify({
          sessionId: sessionId,
          tableKey: tableData.key,
          userMessage: 'Finalizar customização',
          conversationHistory,
        }),
      });

      if (response.status === 404) {
        throw new Error('Sua sessão expirou. Por favor, tente finalizar novamente.');
      }

      if (!response.ok) {
        throw new Error(`Falha ao finalizar a customização: ${response.statusText}`);
      }

      const data = await response.json();
      processApiResponse(data);
      onClose();

    } catch (error) {
      console.error('Erro ao finalizar a customização:', error);
      const errorMessageContent = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      const errorMessage: IAiMessage = {
        role: 'system',
        content: `Erro: ${errorMessageContent}`,
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageContent = (content: string | undefined) => {
    if (!content) {
      return ''; // Retorna string vazia se o conteúdo for nulo ou indefinido
    }
    // Formatação simples para negrito e listas
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/• (.*?)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Área de mensagens */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div 
            key={index} 
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'assistant' ? 'bg-blue-100 dark:bg-blue-900 text-gray-800 dark:text-gray-100' :
                message.role === 'user' ? 'bg-blue-500 text-white' : 
                'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs italic w-full'
              }`}
            >
              <div 
                dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
                className="whitespace-pre-wrap"
              />
              
              {message.timestamp && (
                <div className="text-xs opacity-70 mt-1 text-right">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Área de entrada de mensagem */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex space-x-2">
          <div className="flex-grow relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Descreva o que você precisa..."
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-3 pr-10 resize-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <div className="absolute right-3 bottom-3 text-xs text-gray-400">
              Enter ⏎
            </div>
          </div>
          <button
            onClick={handleSendMessage}
            disabled={isSending || !inputMessage.trim()}
            className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed self-end"
          >
            {isSending ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-send-horizontal"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>
            )}
          </button>
        </div>
        
        {/* Botão de finalizar customização */}
        <button
          onClick={handleFinishCustomization}
          className="mt-4 w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          Concluir Conversa
        </button>
      </div>
    </div>
  );
}

export default AIChatMode;
