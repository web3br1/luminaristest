import { logger } from '../../../lib/logger';
import { ICustomizableTable } from '../models/InterviewTypes';
import type { ISchemaField } from '../../../features/dynamicTables/models/DynamicTable.model';

interface IPreset {
  key: string;
  tables: Record<string, unknown>;
}

/**
 * Classe responsável por extrair informações de tabelas dos presets
 */
export class TableExtractor {

  /**
   * Extrai tabelas da descrição do preset (método legado, mantido apenas para compatibilidade)
   */
  public extractTablesFromDescription(description: string): ICustomizableTable[] {
    // Usa regex para tentar encontrar tabelas na descrição
    const tablesPattern = /(\\w+)\\s*(?:\\(([^)]+)\\)|:\\s*([^,\\.]+))/g;
    
    // Coleta todas as ocorrências de possíveis tabelas usando exec em vez de matchAll
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = tablesPattern.exec(description)) !== null) {
      matches.push(match);
    }
    
    return matches
      .map(match => {
        // O grupo 1 é o nome da tabela, e o grupo 2 ou 3 (o que estiver definido) é a descrição
        const descMatch = match[0].match(/(\\w+)\\s*(?:\\(([^)]+)\\)|:\\s*([^,\\.]+))/i);
        
        if (descMatch) {
          const name = descMatch[1].trim();
          const description = descMatch[2] || descMatch[3] || `Tabela de ${name}`;
          const key = name.toLowerCase().replace(/\\s+/g, '_');
          
          return {
            name,
            key,
            description,
            isSelected: true, // Por padrão, todas as tabelas do preset estão selecionadas
            isCore: true      // Tabelas do preset são consideradas essenciais por padrão
          };
        }
        return null;
      })
      .filter(Boolean) as ICustomizableTable[];
  }
  
  /**
   * Extrai tabelas do preset real usando o PresetService
   */
  public extractTablesFromRealPreset(preset: IPreset): ICustomizableTable[] {
    logger.info(`[TableExtractor] Extraindo tabelas reais do preset: ${preset.key}`);
    
    if (!preset.tables) {
      logger.error(`[TableExtractor] Preset não possui tabelas definidas: ${preset.key}`);
      return [];
    }
    
    // Extrai as tabelas do objeto do preset
    const customizableTables: ICustomizableTable[] = Object.entries(preset.tables)
      .map(([tableKey, tableSchema]: [string, unknown]) => {
        // Verifica se a tabela tem as informações necessárias
        if (!tableSchema) return null;
        const ts = tableSchema as Record<string, unknown>;

        // Deriva o nome e descrição a partir do schema da tabela
        const name = (ts.label as string | undefined) || this.formatTableName(tableKey);
        const description = (ts.description as string | undefined) || `Tabela de ${name}`;

        // Extrai corretamente os campos do schema da tabela
        let fields = [];
        const tsSchema = ts.schema as Record<string, unknown> | undefined;

        // Verifica se temos campos no schema (estrutura correta dos presets)
        if (tsSchema && tsSchema.fields && Array.isArray(tsSchema.fields)) {
          fields = tsSchema.fields.map((field: ISchemaField) => ({
            name: field.name,
            label: field.label || field.name,
            type: field.type || 'string',
            required: !!field.required,
            hidden: false // Por padrão os campos são visíveis
          }));
          
          logger.info(`[TableExtractor] Tabela ${name} possui ${fields.length} campos`);
        } else {
          // Fallback para caso o schema não siga o formato esperado
          logger.warn(`[TableExtractor] Tabela ${name} não possui estrutura de schema.fields válida`);
        }
        
        return {
          key: tableKey,
          name,
          description,
          isSelected: true,  // Por padrão, todas as tabelas do preset estão selecionadas
          isCore: true,      // Tabelas do preset são consideradas essenciais por padrão
          fields: fields
        };
      })
      .filter(Boolean) as ICustomizableTable[];
      
    logger.info(`[TableExtractor] Tabelas extraídas: ${customizableTables.length}`);
    return customizableTables;
  }
  
  /**
   * Formata o nome da tabela de snake_case para um formato legível
   */
  private formatTableName(tableKey: string): string {
    // Transforma snake_case em palavras separadas e capitaliza cada palavra
    return tableKey
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
