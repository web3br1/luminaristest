import type { Header } from './StructuredData.types';
import { SheetStructured } from '@/lib/vector/extractors/ExcelStructuredExtractor';

/**
 * Interface para representar o header de uma planilha Excel conforme retornado pelo extrator
 */
export interface ExcelHeader {
  key: string;
  title: string;
  type: string;
}

/**
 * Converte um header do formato Excel para o formato padrão do sistema
 */
export function excelHeaderToHeader(excelHeader: ExcelHeader): Header {
  return {
    name: excelHeader.key,
    type: excelHeader.type as "TEXT" | "NUMBER" | "CURRENCY" | "PERCENTAGE" | "DATE"
  };
}

/**
 * Converte um array de headers do formato Excel para o formato padrão do sistema
 */
export function convertExcelHeaders(headers: ExcelHeader[]): Header[] {
  return headers.map(header => excelHeaderToHeader(header));
}

/**
 * Converte uma estrutura de planilha Excel para o formato de dados tabulares
 * adequado para armazenamento no banco
 */
export function convertSheetToTableData(sheet: SheetStructured): {
  headers: Header[];
  data: (string | number | null)[][];
} {
  return {
    headers: convertExcelHeaders(sheet.headers),
    data: sheet.data as (string | number | null)[][]
  };
}
