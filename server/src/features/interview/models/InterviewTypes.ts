/**
 * Tipos compartilhados entre InterviewService e CustomizationService
 */

/**
 * Estágios do processo de entrevista
 */
export type InterviewStage = 
  | 'GREETING' 
  | 'DISCOVERING_BUSINESS' 
  | 'CONFIRMING_BUSINESS'
  | 'MATCHING_PRESET'
  | 'AWAITING_CREATION_TYPE_CONFIRMATION'
  | 'CUSTOMIZATION_INTRO'
  | 'CUSTOMIZATION_IN_PROGRESS'
  | 'CUSTOMIZATION_COMPLETED'
  | 'IDENTIFYING_ENTITIES'
  | 'CANNOT_PROCEED'
  | 'COMPLETED';

/**
 * Estágios que podem ser processados com lógica especializada
 */
export type ProcessableStage = 'DISCOVERING_BUSINESS' | 'CONFIRMING_BUSINESS' | 'IDENTIFYING_ENTITIES';

/**
 * Mensagem trocada entre usuário e assistente
 */
export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Resultado do processamento de um turno da entrevista
 */
export interface IInterviewTurnResult {
  response: string;
  nextStage: InterviewStage;
  presetKey?: string;
  startCustomization?: boolean;
  sessionId?: string;
  customizationState?: ICustomizationState;
}

/**
 * Interface para representar uma tabela que pode ser customizada
 */
export interface ICustomizableTable {
  conversationHistory: any[];
  name: string;          // Nome amigável da tabela (ex: "Clientes")
  key: string;           // Identificador único (ex: "customers")
  description: string;   // Descrição breve (ex: "Cadastro de clientes")
  isSelected: boolean;   // Se está selecionada na customização
  isCore: boolean;       // Se é uma tabela essencial que não pode ser removida
  fields?: any[];        // Campos da tabela quando disponíveis (do preset real)
}

/**
 * Estado da customização em andamento
 */
export interface ICustomizationState {
  presetKey: string;             // Chave do preset base
  presetName: string;            // Nome amigável do preset
  tables: ICustomizableTable[];  // Tabelas disponíveis para customização
  customMessages: IMessage[];    // Histórico de mensagens durante a customização
  currentAction?: 'adding' | 'removing' | null;  // Ação atual sendo realizada
  isCompleted: boolean;          // Se o processo de customização foi concluído
}
