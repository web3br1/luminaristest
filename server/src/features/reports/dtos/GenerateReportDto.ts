import { z } from 'zod';

/**
 * Esquema de validação para a geração de relatórios.
 * Define o contrato de dados que a API espera.
 */
export const GenerateReportSchema = z.object({
  query: z.string().min(1, { message: 'A consulta (query) não pode estar vazia.' }),
  chatInstanceId: z.string(),
  documentIds: z.array(z.string()).optional(),
});

// Exporta o tipo inferido do esquema para uso no serviço e na API.
export type GenerateReportDto = z.infer<typeof GenerateReportSchema>;
