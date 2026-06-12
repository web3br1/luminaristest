import { z } from 'zod';

// Schema para um único item do histórico
const HistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

/**
 * Schema para validar a requisição de chat.
 */
export const ChatRequestSchema = z.object({
  query: z.string().max(4000).optional(),
  documentIds: z.array(z.string()).optional(),
  history: z.array(HistoryItemSchema).optional(),
  // Permite que o frontend envie o ID de uma proposta confirmada
  confirmedProposalId: z.string().optional(),
});

/**
 * Schema para a resposta do chat.
 */
export const ChatResponseSchema = z.object({
  answer: z.string(),
  // Tipo da resposta para o frontend saber se deve mostrar um modal
  type: z.enum(['TEXT', 'ACTION_PROPOSAL']).default('TEXT'),
  // Metadados da proposta, se houver
  proposal: z.object({
    id: z.string(),
    action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
    tableName: z.string(),
    tableLabel: z.string(),
    data: z.any(),
  }).optional(),
  sourceDocuments: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      payload: z.object({
        documentId: z.string(),
        userId: z.string(),
        textContent: z.string(),
        fileName: z.string(),
        chunkId: z.string(),
        index: z.number(),
      }),
    })
  ).optional(),
});

// Exporta os tipos inferidos para uso no código
export type ChatRequestDto = z.infer<typeof ChatRequestSchema>;
export type ChatResponseDto = z.infer<typeof ChatResponseSchema>;
