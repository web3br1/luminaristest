import { z } from 'zod';

// Esquema para os cabeçalhos das colunas
export const headerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, { message: 'Header name is required' })
    .regex(/^[a-zA-Z_][a-zA-Z0-9_\s-]*$/, { message: 'Header name must start with a letter or _ and contain only letters, numbers, spaces, - and _.' }),
  type: z.enum(['TEXT', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DATE']),
});

// Definimos um tipo de célula que pode ser string, number ou null
const cellSchema = z.union([z.string(), z.number(), z.null()]);

// Uma linha é um array de células
const rowSchema = z.array(cellSchema);

// Dados tabulares são arrays de linhas
const tabularDataSchema = z.array(rowSchema);

// Esquema para uma única planilha (sheet)
const sheetSchema = z.object({
  name: z.string(),
  headers: z.array(z.object({
    key: z.string(),
    title: z.string(),
    type: z.string()
  })),
  data: tabularDataSchema
});

// Schema para dados multi-planilha
const multiSheetDataSchema = z.array(sheetSchema);

// Esquema para a criação de dados estruturados
export const createStructuredDataSchema = z.object({
  documentId: z.string().cuid(),
  headers: z.array(headerSchema),
  // data pode ser tanto um array bidimensional (dados tabulares)
  // quanto qualquer valor JSON válido (para multi-sheet ou outros formatos)
  data: z.union([
    tabularDataSchema,                      // Formato tabular simples
    multiSheetDataSchema,                    // Formato multi-planilha
    z.record(z.string(), z.any())                        // Qualquer outro objeto JSON válido
  ])
});

// Esquema para atualização dos dados
export const updateStructuredDataSchema = z.object({
  data: z.union([
    tabularDataSchema,                      // Formato tabular simples
    multiSheetDataSchema,                    // Formato multi-planilha
    z.record(z.string(), z.any())                        // Qualquer outro objeto JSON válido
  ])
});

// Tipos inferidos dos schemas (fonte única na camada de DTO)
export type CreateStructuredDataInput = z.infer<typeof createStructuredDataSchema>;
export type UpdateStructuredDataInput = z.infer<typeof updateStructuredDataSchema>;
export type HeaderInput = z.infer<typeof headerSchema>;
