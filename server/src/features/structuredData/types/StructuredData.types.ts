import { z } from 'zod';
import { 
  createStructuredDataSchema, 
  updateStructuredDataSchema,
  headerSchema
} from '../dtos/StructuredDataDto';
import { Header, ColumnFormat } from '../models/StructuredData.model';

// Re-exportamos o tipo Header para que outros módulos possam importá-lo daqui
export type { Header, ColumnFormat } from '../models/StructuredData.model';

// Inferir tipos dos schemas Zod
export type CreateStructuredDataInput = z.infer<typeof createStructuredDataSchema>;
export type UpdateStructuredDataInput = z.infer<typeof updateStructuredDataSchema>;
export type HeaderInput = z.infer<typeof headerSchema>;

/**
 * Tipo para representar headers recebidos de APIs externas
 */
export interface ApiHeader {
  key: string;
  title: string;
  type: string;
}

/**
 * Converte um header da API para o formato interno
 */
export function apiHeaderToHeader(apiHeader: ApiHeader): Header {
  return {
    name: apiHeader.key,
    type: apiHeader.type as "TEXT" | "NUMBER" | "CURRENCY" | "PERCENTAGE" | "DATE"
  };
}

/**
 * Converte um header interno para o formato de coluna para o frontend
 */
export function headerToColumnFormat(header: Header): ColumnFormat {
  return {
    key: header.name,
    title: header.name,  // Usa o nome como título se não existir título específico
    type: header.type
  };
}
