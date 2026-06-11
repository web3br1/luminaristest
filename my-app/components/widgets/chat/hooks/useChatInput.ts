import { useState, useCallback, useRef, RefObject } from 'react';

const MAX_MESSAGE_LENGTH = 1000; // Pode ser importado de um arquivo de constantes globais

/**
 * Props para o hook useChatInput.
 */
interface UseChatInputProps {
  /** Booleano indicando se uma mensagem está sendo enviada (para desabilitar o input e a submissão por Enter). */
  isSendingMessage: boolean;
  /** Callback invocado quando o usuário tenta submeter uma mensagem (ex: pressionando Enter ou clicando no botão de enviar). */
  onSubmitMessage: (message: string) => Promise<void>;
  /** Ref para o elemento de input/textarea HTML, gerenciado externamente (geralmente pelo componente pai, `ChatWidget`). */
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

/**
 * Valores retornados pelo hook useChatInput.
 */
interface UseChatInputReturn {
  /** O valor atual do campo de input. */
  inputValue: string;
  /** Manipulador para o evento `onChange` do input/textarea. Atualiza `inputValue`. */
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Manipulador para o evento `onKeyPress` do input/textarea. Submete a mensagem ao pressionar Enter. */
  handleInputKeyPress: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Função para limpar programaticamente o `inputValue`. */
  clearInput: () => void;
}

/**
 * Hook customizado para gerenciar o estado e comportamento do input de mensagem de um chat.
 * Responsabilidades:
 * - Manter o valor atual do input (`inputValue`).
 * - Fornecer manipuladores para alteração de valor e submissão por Enter.
 * - Permitir a limpeza programática do input.
 * - Interagir com o estado de envio de mensagem para desabilitar o input apropriadamente.
 */
export function useChatInput({
  isSendingMessage,
  onSubmitMessage,
  inputRef, // inputRef não é usado ativamente por este hook, mas é recebido como parte do contrato para consistência.
}: UseChatInputProps): UseChatInputReturn {
  const [inputValue, setInputValue] = useState('');

  /**
   * Atualiza o `inputValue` conforme o usuário digita, respeitando `MAX_MESSAGE_LENGTH`.
   */
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (value.length <= MAX_MESSAGE_LENGTH) {
      setInputValue(value);
    }
  }, []);

  /**
   * Limpa o campo de input.
   */
  const clearInput = useCallback(() => {
    setInputValue('');
  }, []);

  /**
   * Submete a mensagem atual se a tecla Enter for pressionada (sem Shift),
   * o input não estiver vazio e nenhuma mensagem estiver sendo enviada.
   */
  const handleInputKeyPress = useCallback(async (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isSendingMessage && inputValue.trim()) {
      event.preventDefault();
      await onSubmitMessage(inputValue);
      clearInput(); // Limpa o input após a submissão bem-sucedida pela tecla Enter.
    }
  }, [isSendingMessage, inputValue, onSubmitMessage, clearInput]);

  return {
    inputValue,
    handleInputChange,
    handleInputKeyPress,
    clearInput,
  };
} 