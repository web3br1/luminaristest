import type { UserContext } from '@/types/UserContext';
import type { UpdateStructuredDataInput } from '../dtos/StructuredDataDto';
import { NotFoundError, ForbiddenError, ServiceError, UnauthorizedError } from '../../../lib/errors';
import { IStructuredDataRepository } from '../repositories/IStructuredDataRepository';
import {
  IStructuredData,
  StructuredDataResponse,
  SheetData,
  ApiHeader,
  apiHeaderToHeader,
  headerToColumnFormat,
  convertSheetToTableData,
} from '../models/StructuredData.model';
import { SheetStructured } from '@/lib/vector/extractors/ExcelStructuredExtractor';
import { IStructuredDataPolicy } from '../policies/IStructuredDataPolicy';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { logger } from '../../../lib/logger';

export class StructuredDataService {
  private repository: IStructuredDataRepository;
  private policy: IStructuredDataPolicy;
  private openAIService: OpenAIService;

  constructor(
    repository: IStructuredDataRepository,
    policy: IStructuredDataPolicy,
    openAIService: OpenAIService,
  ) {
    this.repository = repository;
    this.policy = policy;
    this.openAIService = openAIService;
  }

  public async getByDocumentId(ctx: UserContext, documentId: string): Promise<StructuredDataResponse> {
    if (!ctx.userId) {
      throw new UnauthorizedError('Authentication required to access structured data');
    }
    if (!(await this.policy.canAccess(ctx, documentId))) {
      throw new ForbiddenError('User has no permission to access this document');
    }

    const structuredData = await this.repository.findByDocumentId(documentId);
    if (!structuredData) {
      throw new NotFoundError(`Structured data not found for document ${documentId}`);
    }

    return this.toResponse(structuredData, documentId);
  }

  public async createFromStructured(
    ctx: UserContext,
    documentId: string,
    data: { sheets: SheetStructured[] }
  ): Promise<IStructuredData | null> {
    if (!ctx.userId) {
      throw new UnauthorizedError('Authentication required to create structured data');
    }
    if (!(await this.policy.canAccess(ctx, documentId))) {
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
      // e armazenamos todas as planilhas em formato serializado (JSON direto no Prisma).
      const firstSheet = data.sheets[0] || { headers: [], data: [] };
      const tableData = convertSheetToTableData(firstSheet);

      return this.repository.create({
        documentId,
        headers: tableData.headers,
        data: data.sheets,
      });
    }

    // Para planilha única, convertemos diretamente para o formato tabular.
    const singleSheet = data.sheets[0] || { headers: [], data: [] };
    const tableData = convertSheetToTableData(singleSheet);

    return this.repository.create({
      documentId,
      headers: tableData.headers,
      data: tableData.data,
    });
  }

  public async createFromText(ctx: UserContext, documentId: string, rawText: string): Promise<IStructuredData> {
    if (!ctx.userId) {
      throw new UnauthorizedError('Authentication required to create structured data');
    }
    if (!(await this.policy.canAccess(ctx, documentId))) {
      throw new ForbiddenError('User does not have access to this document.');
    }

    logger.info('Starting structured data extraction with OpenAI', { documentId });

    const structuredContent = await this.openAIService.extractStructuredData(rawText) as Record<string, unknown> | null;

    if (!structuredContent || !structuredContent.data) {
      logger.error('Invalid or incomplete data from OpenAI', { documentId });
      throw new ServiceError('Failed to get valid structured data from AI.');
    }

    // Validar os headers recebidos da API
    if (structuredContent.headers) {
      (structuredContent.headers as ApiHeader[]).forEach((header) => {
        if (!header.key || !header.title || !header.type) {
          logger.error('Header is missing required properties (key, title, or type)', { header, documentId });
          throw new ServiceError('Invalid header structure received from AI.');
        }
      });
    }

    // Converter os headers para o formato padrão
    const convertedHeaders = structuredContent.headers
      ? (structuredContent.headers as ApiHeader[]).map(apiHeaderToHeader)
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
      data: safeData,
    });
  }

  public async update(
    ctx: UserContext,
    documentId: string,
    data: UpdateStructuredDataInput
  ): Promise<StructuredDataResponse> {
    if (!ctx.userId) {
      throw new UnauthorizedError('Authentication required to update structured data');
    }
    if (!(await this.policy.canAccess(ctx, documentId))) {
      throw new ForbiddenError('User has no permission to access this document');
    }

    const existing = await this.repository.findByDocumentId(documentId);
    if (!existing) {
      throw new NotFoundError(`Structured data not found for document ${documentId}`);
    }

    const updated = await this.repository.update(existing.id, data);
    // Devolve o mesmo shape do GET (columns + data normalizado + sheets?) para um contrato consistente.
    return this.toResponse(updated, documentId);
  }

  /**
   * Mapeia o modelo de domínio para a resposta do frontend: converte headers em `columns` e,
   * quando multi-sheet, expõe a estrutura completa em `sheets` e usa a primeira aba como `data`.
   * `data` já chega parseado pelo repositório (toStructuredData), nunca como string.
   */
  private toResponse(structuredData: IStructuredData, documentId: string): StructuredDataResponse {
    const { headers, data, ...rest } = structuredData;
    const columns = headers.map(headerToColumnFormat);

    let normalizedData = data;
    let sheets: SheetData[] | undefined;

    if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];
      if (
        typeof firstItem === 'object' &&
        firstItem !== null &&
        'name' in firstItem &&
        'data' in firstItem &&
        Array.isArray((firstItem as { data: unknown }).data)
      ) {
        logger.info('Multi-sheet data detected', { sheetsCount: data.length, documentId });
        sheets = data as SheetData[];
        normalizedData = (firstItem as SheetData).data ?? [];
      }
    }

    return { ...rest, columns, data: normalizedData, ...(sheets ? { sheets } : {}) };
  }
}
