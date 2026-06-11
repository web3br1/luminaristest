import { ChatRequestDto as ChatRequest, ChatResponseDto as ChatResponse } from '../dtos/ChatDto';
import { UserContext } from '@/lib/authUtils';

/**
 * Interface para o serviço de chat.
 * Define o contrato que o ChatService deve seguir.
 */
export interface IChatService {
  /**
   * Gera uma resposta para a consulta do usuário com base nos documentos fornecidos.
   * @param request - O objeto de requisição do chat contendo a consulta e os filtros.
   * @returns Uma promessa que resolve para a resposta do chat.
   */
  generateResponse(request: ChatRequest & { user: UserContext }): Promise<ChatResponse>;
}
