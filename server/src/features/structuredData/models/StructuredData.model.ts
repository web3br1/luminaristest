import { Prisma } from 'generated/prisma';

// Tipo para dados estruturados do Prisma
type PrismaStructuredData = Prisma.StructuredDataGetPayload<{}>

/**
 * Interface para uma planilha individual dentro do formato multi-sheet
 */
export interface SheetData {
  name: string;
  headers: { key: string; title: string; type: string }[];
  data: (string | number | null)[][];
}

/**
 * Tipos possíveis para dados estruturados
 * - Dados tabulares simples: array bidimensional
 * - Dados multi-planilha: array de objetos SheetData
 * - Qualquer outro objeto JSON válido
 */
export type StructuredDataValue = 
  | (string | number | null)[][] 
  | SheetData[] 
  | Record<string, any>;

/**
 * Interface para representar um dado estruturado no domínio da aplicação
 */
export interface IStructuredData {
  id: string;
  documentId: string;
  headers: Header[];
  data: StructuredDataValue;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface para representar um header de dados estruturados
 */
export interface Header {
  name: string;
  type: "TEXT" | "NUMBER" | "CURRENCY" | "PERCENTAGE" | "DATE";
}

/**
 * Interface para representar a resposta de dados estruturados para o frontend
 * que inclui 'columns' ao invés de 'headers'
 */
export interface StructuredDataResponse extends Omit<IStructuredData, 'headers'> {
  columns: ColumnFormat[];
}

/**
 * Interface para o formato de colunas que o frontend espera
 */
export interface ColumnFormat {
  key: string;
  title: string;
  type: string;
}

/**
 * Converte um modelo Prisma para o modelo de domínio
 */
export function toStructuredData(prismaStructuredData: PrismaStructuredData): IStructuredData {
  // Garantimos que os campos JSON sejam convertidos corretamente
  let headers: Header[] = [];
  let data: StructuredDataValue = [];

  try {
    // Tratamos o campo headers que é armazenado como JSON
    if (prismaStructuredData.headers) {
      // Se já for um array, usamos diretamente com tipagem correta
      if (Array.isArray(prismaStructuredData.headers)) {
        headers = prismaStructuredData.headers.map(header => {
          // Garantimos tratamento seguro de tipos
          const headerObj = header as Record<string, unknown>;
          return {
            name: String(headerObj?.name || headerObj?.key || ''),
            type: (String(headerObj?.type || 'TEXT')) as "TEXT" | "NUMBER" | "CURRENCY" | "PERCENTAGE" | "DATE"
          };
        });
      } 
      // Se for string (JSON serializado), fazemos o parse
      else if (typeof prismaStructuredData.headers === 'string') {
        try {
          const parsed = JSON.parse(prismaStructuredData.headers);
          if (Array.isArray(parsed)) {
            headers = parsed.map(header => {
              const headerObj = header as Record<string, unknown>;
              return {
                name: String(headerObj?.name || headerObj?.key || ''),
                type: (String(headerObj?.type || 'TEXT')) as "TEXT" | "NUMBER" | "CURRENCY" | "PERCENTAGE" | "DATE"
              };
            });
          }
        } catch (e) {
          console.error('Failed to parse headers JSON', e);
        }
      }
    }

    // Tratamos o campo data que é armazenado como JSON
    if (prismaStructuredData.data) {
      // Se já for um array de arrays, é o formato tabular simples
      if (Array.isArray(prismaStructuredData.data) && 
          prismaStructuredData.data.length > 0 && 
          Array.isArray(prismaStructuredData.data[0])) {
        
        // Formato tabular simples: array bidimensional
        data = prismaStructuredData.data.map(row => {
          if (Array.isArray(row)) {
            return row.map(cell => {
              // Garantimos que os valores sejam dos tipos esperados
              if (typeof cell === 'string' || typeof cell === 'number' || cell === null) {
                return cell;
              }
              // Convertemos outros tipos para string
              return String(cell);
            });
          }
          return [];
        });
      } 
      // Se for um array de objetos com name, headers e data, é formato multi-sheet
      else if (Array.isArray(prismaStructuredData.data) && 
               prismaStructuredData.data.length > 0 &&
               typeof prismaStructuredData.data[0] === 'object' &&
               prismaStructuredData.data[0] !== null) {
        
        // Verificamos se tem a estrutura esperada de um SheetData
        const firstItem = prismaStructuredData.data[0];
        if ('name' in firstItem && 'headers' in firstItem && 'data' in firstItem) {
          // É um formato multi-sheet - fazemos uma conversão segura
          data = prismaStructuredData.data as unknown as SheetData[];
        }
      }
      // Se for string (JSON serializado), fazemos o parse
      else if (typeof prismaStructuredData.data === 'string') {
        try {
          const parsed = JSON.parse(prismaStructuredData.data);
          
          // Verifica se é um formato tabular simples (array de arrays)
          if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
            data = parsed.map(row => {
              if (Array.isArray(row)) {
                return row.map(cell => {
                  if (typeof cell === 'string' || typeof cell === 'number' || cell === null) {
                    return cell;
                  }
                  return String(cell);
                });
              }
              return [];
            });
          } 
          // Verifica se é formato multi-sheet (array de objetos com estrutura específica)
          else if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
            const firstItem = parsed[0];
            if ('name' in firstItem && 'headers' in firstItem && 'data' in firstItem) {
              data = parsed as unknown as SheetData[];
            }
          }
          // Caso contrário, mantemos o objeto JSON como está
          else {
            data = parsed;
          }
        } catch (error) {
          console.error('Failed to parse data JSON string:', error);
        }
      }
      // Se for um objeto JSON, mantemos como está
      else if (typeof prismaStructuredData.data === 'object' && prismaStructuredData.data !== null) {
        data = prismaStructuredData.data as Record<string, any>;
      }
    }
  } catch (error) {
    console.error('Error converting Prisma data to domain model', error);
  }

  return {
    id: prismaStructuredData.id,
    documentId: prismaStructuredData.documentId,
    headers,
    data,
    createdAt: prismaStructuredData.createdAt,
    updatedAt: prismaStructuredData.updatedAt
  };
}
