import { ChatRequestDto as ChatRequest, ChatResponseDto as ChatResponse } from '../dtos/ChatDto';
import { UserContext } from '@/lib/authUtils';

/**
 * Contract for the chat service.
 */
export interface IChatService {
  /**
   * Generates a response to the user's query.
   * Routes to RAG (when documents are selected) or to the ERP agent flow otherwise.
   * @param request - Chat request (query, filters, history) plus the authenticated user.
   * @returns A promise resolving to the chat response.
   */
  generateResponse(request: ChatRequest & { user: UserContext }): Promise<ChatResponse>;
}
