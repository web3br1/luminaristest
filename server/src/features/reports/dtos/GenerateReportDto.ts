import { z } from 'zod';

/**
 * Esquema de validação para a geração de relatórios.
 * Define o contrato de dados que a API espera.
 */
export const GenerateReportSchema = z.object({
  query: z.string().min(1, { message: 'A consulta (query) não pode estar vazia.' }),
  // Client-side correlation id (the chat thread the SSE result belongs to). Echoed back, not persisted.
  chatInstanceId: z.string().cuid({ message: 'Invalid chat instance ID format' }),
  documentIds: z.array(z.string().cuid({ message: 'Invalid document ID format' })).optional(),
});

// Exporta o tipo inferido do esquema para uso no serviço e na API.
export type GenerateReportDto = z.infer<typeof GenerateReportSchema>;
