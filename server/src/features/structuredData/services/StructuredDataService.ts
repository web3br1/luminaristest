import type { IUser } from '../../users/models/User.model';
import type { UpdateStructuredDataInput, ApiHeader } from '../types/StructuredData.types';
import { apiHeaderToHeader, headerToColumnFormat } from '../types/StructuredData.types';
import { NotFoundError, ForbiddenError } from '../../../lib/errors';
import { IStructuredDataRepository } from '../repositories/IStructuredDataRepository';
import { Prisma } from 'generated/prisma';
import { IStructuredData, StructuredDataResponse } from '../models/StructuredData.model';
import { convertExcelHeaders, convertSheetToTableData } from '../types/Sheet.types';
import { SheetStructured } from '@/lib/vector/extractors/ExcelStructuredExtractor';
import { StructuredDataPolicy } from '../policies/StructuredDataPolicy';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { logger } from '../../../lib/logger';

export class StructuredDataService {
  private repository: IStructuredDataRepository;
  private policy: StructuredDataPolicy;
  private openAIService: OpenAIService;

  constructor(
    repository: IStructuredDataRepository,
    policy: StructuredDataPolicy,
    openAIService: OpenAIService,
  ) {
    this.repository = repository;
    this.policy = policy;
    this.openAIService = openAIService;
  }

  public async getByDocumentId(user: IUser, documentId: string): Promise<StructuredDataResponse> {
    // Verificar permissão
    const canAccess = await this.policy.canAccess(user, documentId);
    if (!canAccess) {
      throw new ForbiddenError('User has no permission to access this document');
    }

    // Buscar dados estruturados
    const structuredData = await this.repository.findByDocumentId(documentId);
    if (!structuredData) {
      throw new NotFoundError(`Structured data not found for document ${documentId}`);
    }

    // Converter headers para o formato de colunas que o frontend espera
    const { headers, data, ...rest } = structuredData;
    const columns = headers.map(header => headerToColumnFormat(header));

    // Verificar se os dados são multi-sheet (JSON string ou array de sheets)
    let normalizedData = data;
    let sheets = undefined;
    
    try {
      // Se é uma string, tentar fazer parse
      if (typeof data === 'string') {
        try {
          const parsedData = JSON.parse(data);
          
          // Verificar se é um formato multi-sheet (array de objetos com name, headers, data)
          if (Array.isArray(parsedData) && parsedData.length > 0 && parsedData[0]?.name) {
            logger.info('Multi-sheet data detected in string format', { sheetsCount: parsedData.length });
            sheets = parsedData;
            // Usar os dados da primeira planilha como dados principais
            normalizedData = parsedData[0].data || [];
          }
        } catch (e) {
          logger.warn('Failed to parse data string as JSON', { error: e, documentId });
        }
      }
      // Se já é um array e parece ser um formato multi-sheet
      else if (Array.isArray(data) && data.length > 0) {
        // Verificamos se parece ser uma estrutura multi-sheet verificando a primeira entrada
        const firstItem = data[0];
        
        // Verificar se tem a estrutura esperada de um sheet (name e data)
        if (typeof firstItem === 'object' && firstItem !== null && 
            'name' in firstItem && 'data' in firstItem && Array.isArray(firstItem.data)) {
          
          logger.info('Multi-sheet data detected in array format', { sheetsCount: data.length });
          
          // Tratamos como multi-sheet
          sheets = data;
          // Usar os dados da primeira planilha como dados principais
          normalizedData = firstItem.data || [];
        }
      }
    } catch (error) {
      logger.warn('Failed to process structured data format', { error, documentId });
    }

    // Retornar os dados estruturados
    return { ...rest, columns, data: normalizedData, ...(sheets && { sheets }) };
  }

  public async createFromStructured(
    user: IUser,
    documentId: string,
    data: { sheets: SheetStructured[] }
  ): Promise<IStructuredData | null> {
    const canAccess = await this.policy.canAccess(user, documentId);
    if (!canAccess) {
      throw new ForbiddenError('User does not have access to this document.');
    }

    logger.info(`Saving directly extracted structured data for document ${documentId}`);

    if (!data || !data.sheets || data.sheets.length === 0) {
      logger.warn(`No structured data provided to save for document ${documentId}`);
      return null;
    }

    // Se houver apenas uma planilha, simplificamos a estrutura para o frontend.
    // Se houver múltiplas, mantemos a estrutura completa com o array 'sheets'.
    const isMultiSheet = data.sheets.length > 1;

    if (isMultiSheet) {
      // Para multi-planilha, convertemos os headers da primeira planilha
      // e armazenamos todas as planilhas em formato serializado
      const firstSheet = data.sheets[0] || { headers: [], data: [] };
      const tableData = convertSheetToTableData(firstSheet);
      
      // Armazenamos todas as planilhas em formato adequado para o banco
      // Os dados já estão no formato correto para serem armazenados como JSON
      return this.repository.create({
        documentId,
        headers: tableData.headers,
        // Não precisamos converter para string, o Prisma aceita objetos diretos
        data: data.sheets
      });
    } else {
      // Para planilha única, convertemos diretamente para o formato tabular
      const singleSheet = data.sheets[0] || { headers: [], data: [] };
      const tableData = convertSheetToTableData(singleSheet);
      
      return this.repository.create({
        documentId,
        headers: tableData.headers,
        data: tableData.data
      });
    }
  }

  public async createFromText(user: IUser, documentId: string, rawText: string): Promise<IStructuredData> {
    const canAccess = await this.policy.canAccess(user, documentId);
    if (!canAccess) {
      throw new ForbiddenError('User does not have access to this document.');
    }

    logger.info('Starting structured data extraction with OpenAI', { documentId });

    const structuredContent = await this.openAIService.extractStructuredData(rawText) as Record<string, unknown> | null;

    if (!structuredContent || !structuredContent.data) {
      logger.error('Invalid or incomplete data from OpenAI', { documentId });
      throw new Error('Failed to get valid structured data from AI.');
    }

    // Validar os headers recebidos da API
    if (structuredContent.headers) {
      (structuredContent.headers as ApiHeader[]).forEach((header) => {
        if (!header.key || !header.title || !header.type) {
          logger.error('Header is missing required properties (key, title, or type)', { header, documentId });
          throw new Error('Invalid header structure received from AI.');
        }
      });
    }

    // Converter os headers para o formato padrão
    const convertedHeaders = structuredContent.headers 
      ? (structuredContent.headers as ApiHeader[]).map(header => apiHeaderToHeader(header))
      : [];

    logger.info('Structured data extraction successful, saving to database.', { documentId });

    // Garantimos que o tipo de dados está correto para o banco
    const safeData: (string | number | null)[][] = Array.isArray(structuredContent.data)
      ? (structuredContent.data as unknown[][]).map((row) =>
          Array.isArray(row) ? row.map((cell: unknown) =>
            cell === undefined ? null : cell as string | number | null
          ) : []
        )
      : [];

    return this.repository.create({
      documentId,
      headers: convertedHeaders,
      data: safeData
    });
  }

  public async update(user: IUser, documentId: string, data: UpdateStructuredDataInput) {
    const existingData = await this.getByDocumentId(user, documentId); // A própria getByDocumentId já faz a checagem de política

    return this.repository.update(existingData.id, data);
  }
}
