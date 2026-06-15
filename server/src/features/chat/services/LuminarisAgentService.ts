import { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import { UserContext } from '../../../lib/authUtils';
import logger from '../../../lib/logger';
import { IActionProposalRepository } from '../repositories/IActionProposalRepository';
import { ActionProposal, Prisma } from 'generated/prisma';
import OpenAI from 'openai';

export interface ActionProposalData {
    id: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    tableId: string;
    tableName: string;
    tableLabel: string;
    data: Record<string, unknown>;
    userId: string;
}

export class LuminarisAgentService {
    constructor(
        private dynamicTableService: DynamicTableService,
        private proposalRepository: IActionProposalRepository
    ) { }

    /**
     * Generates a list of OpenAI Tools based on the user's available tables.
     */
    async getTools(userId: string): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
            {
                type: 'function',
                function: {
                    name: 'list_my_tables',
                    description: 'List all ERP/CRM tables available for the current user.',
                    parameters: { type: 'object', properties: {} }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'get_table_schema',
                    description: 'Get the detailed schema (fields, types, relations) of a specific table.',
                    parameters: {
                        type: 'object',
                        properties: {
                            tableId: { type: 'string', description: 'The unique ID of the table.' }
                        },
                        required: ['tableId']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'query_table_data',
                    description: 'Search for records in a specific table.',
                    parameters: {
                        type: 'object',
                        properties: {
                            tableId: { type: 'string', description: 'The unique ID of the table.' },
                            filters: { type: 'object', description: 'Optional key-value filters.' }
                        },
                        required: ['tableId']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'request_record_creation',
                    description: 'Triggers a UI modal for the user to confirm the creation of a new record. YOU MUST PROVIDE ALL DATA HERE. Calling this IS the way to ask for confirmation.',
                    parameters: {
                        type: 'object',
                        properties: {
                            tableId: { type: 'string', description: 'The unique ID of the table (mandatory).' },
                            data: { type: 'object', description: 'The data for the new record. MUST NOT BE EMPTY. Include all mandatory fields from the schema.' }
                        },
                        required: ['tableId', 'data']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'request_record_update',
                    description: 'Triggers a UI modal for the user to confirm an update to an existing record. Calling this IS the way to ask for confirmation.',
                    parameters: {
                        type: 'object',
                        properties: {
                            tableId: { type: 'string', description: 'The unique ID of the table.' },
                            recordId: { type: 'string', description: 'The unique ID of the specific record to update.' },
                            data: { type: 'object', description: 'The specific fields to update.' }
                        },
                        required: ['tableId', 'recordId', 'data']
                    }
                }
            }
        ];

        return tools;
    }

    /**
     * Handles a tool call from the LLM.
     */
    async handleToolCall(user: UserContext, functionName: string, args: Record<string, unknown>): Promise<unknown> {
        logger.info(`Agent Tool Call: ${functionName}`, { userId: user.userId, args });

        switch (functionName) {
            case 'list_my_tables': {
                const tables = await this.dynamicTableService.getTablesForUser(user.userId);
                return tables.map(t => ({ id: t.id, name: t.name, category: t.category }));
            }

            case 'get_table_schema': {
                const table = await this.dynamicTableService.getTableById(user, args.tableId as string);
                return {
                    id: table.id,
                    name: table.name,
                    category: table.category,
                    fields: (table.schema as unknown as Record<string, unknown>)['fields']
                };
            }

            case 'query_table_data': {
                const data = await this.dynamicTableService.getAllTableData(user, args.tableId as string);
                let filtered = data;
                if (args.filters) {
                    filtered = data.filter((row) => {
                        return Object.entries(args.filters as Record<string, unknown>).every(([key, val]) => (row.data as Record<string, unknown>)?.[key] === val);
                    });
                }
                return filtered.slice(0, 10);
            }

            case 'request_record_creation': {
                const creationData = args.data as Record<string, unknown> | undefined;
                if (!creationData || Object.keys(creationData).length === 0) {
                    return { error: 'ERRO: Você deve fornecer o objeto "data" com os campos preenchidos. Não posso criar uma proposta vazia.' };
                }
                const table = await this.dynamicTableService.getTableById(user, args.tableId as string);
                const proposal = await this.proposalRepository.create({
                    userId: user.userId,
                    action: 'CREATE',
                    tableId: table.id,
                    tableName: table.name,
                    tableLabel: table.name,
                    data: creationData as unknown as Prisma.InputJsonValue
                });
                return {
                    status: 'PROPOSED',
                    proposalId: proposal.id,
                    message: 'Proposta gerada com sucesso. O modal de confirmação aparecerá agora para o usuário.'
                };
            }

            case 'request_record_update': {
                const updateData = args.data as Record<string, unknown> | undefined;
                if (!updateData || Object.keys(updateData).length === 0) {
                    return { error: 'ERRO: Você deve fornecer os campos para atualização no argumento "data".' };
                }
                const table = await this.dynamicTableService.getTableById(user, args.tableId as string);
                const proposal = await this.proposalRepository.create({
                    userId: user.userId,
                    action: 'UPDATE',
                    tableId: table.id,
                    tableName: table.name,
                    tableLabel: table.name,
                    data: { ...updateData, id: args.recordId as string } as unknown as Prisma.InputJsonValue
                });
                return { status: 'PROPOSED', proposalId: proposal.id };
            }

            default:
                throw new Error(`Unknown function: ${functionName}`);
        }
    }

    /**
     * Executes a previously proposed action after user confirmation.
     */
    async executeProposal(user: UserContext, proposalId: string): Promise<any> {
        const proposal = await this.proposalRepository.findById(proposalId);
        if (!proposal) throw new Error('Proposal not found or expired.');
        if (proposal.userId !== user.userId) throw new Error('Unauthorized proposal execution.');

        logger.info(`Executing confirmed proposal: ${proposalId}`, { proposal });

        try {
            if (proposal.action === 'CREATE') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
                const result = await this.dynamicTableService.createTableData(user, proposal.tableId, { data: proposal.data as any });
                await this.proposalRepository.delete(proposalId);
                return { success: true, result };
            } else if (proposal.action === 'UPDATE') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
                const { id, ...data } = proposal.data as any;
                const result = await this.dynamicTableService.updateTableData(user, id, { data });
                await this.proposalRepository.delete(proposalId);
                return { success: true, result };
            }
        } catch (error: unknown) {
            logger.error(`Failed to execute proposal ${proposalId}`, { error });
            throw error;
        }
    }

    public async getProposal(proposalId: string): Promise<ActionProposal | null> {
        return this.proposalRepository.findById(proposalId);
    }
}
