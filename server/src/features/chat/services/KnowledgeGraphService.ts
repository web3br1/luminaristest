import { ActionProposalRepository } from '../repositories/ActionProposalRepository';
import { IKnowledgeGraphRepository } from '../repositories/IKnowledgeGraphRepository';
import { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import { AppError } from '../../../lib/errors';
import logger from '../../../lib/logger';

export interface KnowledgeGraphData {
    tables: {
        id: string;
        name: string;
        label: string;
        category: string;
        fields: {
            name: string;
            label: string;
            type: string;
            required: boolean;
            options?: string[];
            relation?: {
                targetTable: string;
                displayField: string;
            };
        }[];
    }[];
    relations: {
        sourceTable: string;
        targetTable: string;
        field: string;
        type: '1:1' | '1:N';
    }[];
}

export class KnowledgeGraphService {
    constructor(
        private repository: IKnowledgeGraphRepository,
        private tableRepository: IDynamicTableRepository
    ) { }

    /**
     * Generates and saves the Knowledge Graph for a user.
     */
    async syncGraph(userId: string): Promise<KnowledgeGraphData> {
        try {
            const tables = await this.tableRepository.findTablesByUserId(userId);

            const graphData: KnowledgeGraphData = {
                tables: tables.map(t => ({
                    id: t.id,
                    name: t.name,
                    label: t.name,
                    category: t.category,
                    fields: (t.schema as any).fields.map((f: any) => ({
                        name: f.name,
                        label: f.label,
                        type: f.type,
                        required: f.required,
                        options: f.options,
                        relation: f.relation ? {
                            targetTable: f.relation.targetTable,
                            displayField: f.relation.displayField
                        } : undefined
                    }))
                })),
                relations: []
            };

            // Extract relations
            for (const table of tables) {
                for (const field of (table.schema as any).fields) {
                    if (field.type === 'relation' && field.relation) {
                        graphData.relations.push({
                            sourceTable: table.id,
                            targetTable: field.relation.targetTable,
                            field: field.name,
                            type: field.relation.allowMultiple ? '1:N' : '1:1'
                        });
                    }
                }
            }

            // Save using repository
            await this.repository.upsert(userId, graphData);

            return graphData;
        } catch (error: any) {
            logger.error(`Failed to sync Knowledge Graph for user ${userId}`, error);
            throw new AppError('Failed to synchronize knowledge graph', 500, 'KNOWLEDGE_GRAPH_SYNC_ERROR');
        }
    }

    /**
     * Retrieves the Knowledge Graph for a user.
     */
    async getGraph(userId: string): Promise<KnowledgeGraphData | null> {
        try {
            const record = await this.repository.findByUserId(userId);

            if (record) {
                return record.data as unknown as KnowledgeGraphData;
            }

            // If not found, sync it for the first time
            return this.syncGraph(userId);
        } catch (error: any) {
            if (error instanceof AppError) throw error;
            logger.error(`Failed to retrieve Knowledge Graph for user ${userId}`, error);
            throw new AppError('Failed to retrieve knowledge graph', 500, 'KNOWLEDGE_GRAPH_FETCH_ERROR');
        }
    }

    /**
     * Formats the graph for inclusion in the AI System Prompt.
     */
    async getGraphPrompt(userId: string): Promise<string> {
        const graph = await this.getGraph(userId);
        if (!graph || graph.tables.length === 0) {
            return "Nenhuma tabela ou estrutura de dados encontrada para este usuário.";
        }

        let prompt = "MAPA DE CONHECIMENTO DO SISTEMA (TABELAS E RELAÇÕES):\n";
        prompt += "IMPORTANTE: Para qualquer operação de leitura ou escrita usando ferramentas (tools), você DEVE usar o 'ID' da tabela para o parâmetro 'tableId'.\n\n";

        for (const table of graph.tables) {
            prompt += `- Nome: ${table.name} (Label: ${table.label}) | ID: ${table.id}\n`;
            prompt += `  Campos:\n`;
            for (const field of table.fields) {
                const relInfo = field.relation ? ` (Relaciona com: ${field.relation.targetTable})` : "";
                const optionsInfo = (field.options && field.options.length > 0) ? ` [Opções permitidas: ${field.options.join(', ')}]` : "";
                prompt += `    * ${field.name}: ${field.type}${field.required ? " (Obrigatório)" : ""}${relInfo}${optionsInfo}\n`;
            }
        }

        if (graph.relations.length > 0) {
            prompt += "\nRELAÇÕES E VÍNCULOS:\n";
            for (const rel of graph.relations) {
                prompt += `- ${rel.sourceTable}.${rel.field} -> ${rel.targetTable} (${rel.type})\n`;
            }
        }

        return prompt;
    }
}
