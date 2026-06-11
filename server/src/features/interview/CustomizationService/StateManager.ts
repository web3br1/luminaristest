import { logger } from '../../../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { ICustomizableTable, ICustomizationState, IMessage } from '../models/InterviewTypes';

/**
 * Classe responsável por gerenciar o estado da customização.
 * 
 * IMPORTANTE: Esta implementação armazena o estado da sessão em memória. 
 * Isso é adequado para desenvolvimento, mas NÃO para produção, pois o estado
 * será perdido se o servidor reiniciar e não pode ser compartilhado entre
 * múltiplos servidores. Para produção, considere substituir por uma solução
 * de armazenamento persistente como Redis.
 */
export class StateManager {
  private static instance: StateManager;

  // Armazena os estados de customização ativos, indexados pelo sessionId
  private activeCustomizations: Record<string, ICustomizationState> = {};

  // O construtor é privado para evitar a criação de novas instâncias
  private constructor() {
    logger.info('[StateManager] Singleton StateManager inicializado.');
  }

  // Método estático para obter a instância única da classe
  public static getInstance(): StateManager {
    // Em produção, usa o padrão singleton clássico.
    if (process.env.NODE_ENV === 'production') {
      if (!StateManager.instance) {
        StateManager.instance = new StateManager();
      }
      return StateManager.instance;
    } else {
      // Em desenvolvimento, armazena a instância no objeto global para
      // sobreviver ao hot-reloading do Next.js.
      const globalWithStateManager = globalThis as typeof globalThis & {
        stateManager: StateManager;
      };

      if (!globalWithStateManager.stateManager) {
        globalWithStateManager.stateManager = new StateManager();
      }
      return globalWithStateManager.stateManager;
    }
  }

  /**
   * Gera um novo ID de sessão
   */
  public generateSessionId(): string {
    return uuidv4();
  }

  /**
   * Verifica se uma sessão de customização existe
   */
  public sessionExists(sessionId: string): boolean {
    return !!this.activeCustomizations[sessionId];
  }

  /**
   * Obtém o estado atual de uma sessão de customização
   */
  public getSessionState(sessionId: string): ICustomizationState | null {
    if (!this.activeCustomizations[sessionId]) {
      logger.error(`[StateManager] Sessão com ID ${sessionId} não encontrada`);
      return null;
    }
    return this.activeCustomizations[sessionId];
  }

  /**
   * Cria um novo estado de customização
   */
  public createSessionState(
    presetKey: string, 
    presetName: string, 
    tables: ICustomizableTable[], 
    sessionId: string
  ): ICustomizationState {
    logger.info(`[StateManager] Criando estado de customização para ${presetName} com ID ${sessionId}`);
    
    const customizationState: ICustomizationState = {
      presetKey,
      presetName,
      tables: tables.map(table => ({...table, conversationHistory: []})),
      customMessages: [],
      isCompleted: false
    };
    
    // Armazena o estado da customização
    this.activeCustomizations[sessionId] = customizationState;
    
    return customizationState;
  }

  /**
   * Adiciona uma mensagem ao histórico de customização
   */
  public addCustomizationMessage(sessionId: string, message: IMessage): boolean {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      logger.error(`[StateManager] Não foi possível adicionar mensagem: sessão ${sessionId} não encontrada`);
      return false;
    }
    
    session.customMessages.push(message);
    return true;
  }

  /**
   * Adiciona uma nova tabela ao estado da customização
   */
  public addTable(
    sessionId: string, 
    tableName: string, 
    description: string
  ): boolean {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      logger.error(`[StateManager] Não foi possível adicionar tabela: sessão ${sessionId} não encontrada`);
      return false;
    }
    
    // Gera uma chave a partir do nome da tabela
    const key = tableName.toLowerCase().replace(/\\s+/g, '_');
    
    // Verifica se já existe uma tabela com essa chave
    if (session.tables.some(t => t.key === key)) {
      logger.warn(`[StateManager] Tabela com chave ${key} já existe na sessão ${sessionId}`);
      return false;
    }
    
    // Adiciona a nova tabela
    session.tables.push({
      name: tableName,
      key,
      description,
      isSelected: true,
      isCore: false, // Tabelas adicionadas pelo usuário não são essenciais por padrão
      conversationHistory: [], // Inicializa o histórico da conversa para a nova tabela
    });
    
    logger.info(`[StateManager] Tabela ${tableName} adicionada à sessão ${sessionId}`);
    return true;
  }

  /**
   * Remove uma tabela do estado da customização
   */
  public removeTable(sessionId: string, tableKey: string): boolean {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      logger.error(`[StateManager] Não foi possível remover tabela: sessão ${sessionId} não encontrada`);
      return false;
    }
    
    // Verifica se a tabela existe
    const tableIndex = session.tables.findIndex(t => 
      t.key === tableKey || t.name.toLowerCase() === tableKey.toLowerCase()
    );
    
    if (tableIndex === -1) {
      logger.warn(`[StateManager] Tabela ${tableKey} não encontrada na sessão ${sessionId}`);
      return false;
    }
    
    // Verifica se a tabela é essencial
    if (session.tables[tableIndex].isCore) {
      logger.warn(`[StateManager] Tentativa de remover tabela essencial ${tableKey} na sessão ${sessionId}`);
      return false;
    }
    
    // Remove a tabela
    session.tables.splice(tableIndex, 1);
    logger.info(`[StateManager] Tabela ${tableKey} removida da sessão ${sessionId}`);
    return true;
  }

  /**
   * Gera um resumo do estado atual da customização para ser usado como contexto para a IA
   */
  public getCustomizationSummary(sessionId: string): string {
    const session = this.getSessionState(sessionId);
    if (!session) return 'Nenhuma sessão ativa.';

    const tableSummary = session.tables.map(t => 
      `- ${t.name} (${t.isCore ? 'Essencial' : 'Customizada'})`
    ).join('\n');

    return `O sistema atualmente possui as seguintes tabelas:\n${tableSummary}`;
  }

  /**
   * Define o estado atual da customização
   */
  public setCurrentAction(
    sessionId: string, 
    action: 'adding' | 'removing' | null
  ): boolean {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      logger.error(`[StateManager] Não foi possível definir ação: sessão ${sessionId} não encontrada`);
      return false;
    }
    
    session.currentAction = action;
    logger.info(`[StateManager] Ação definida para ${action} na sessão ${sessionId}`);
    return true;
  }

  /**
   * Marca a customização como concluída
   */
  public completeCustomization(sessionId: string): boolean {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      logger.error(`[StateManager] Não foi possível concluir customização: sessão ${sessionId} não encontrada`);
      return false;
    }
    
    session.isCompleted = true;
    session.currentAction = null;
    logger.info(`[StateManager] Customização da sessão ${sessionId} marcada como concluída`);
    return true;
  }

  /**
   * Gera um relatório textual completo do estado atual da customização
   */
  public getCustomizationReport(sessionId: string): string {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      return "Sessão de customização não encontrada";
    }
    
    const tables = session.tables
      .map(t => `- ${t.name}: ${t.description} (${t.isCore ? 'essencial' : 'opcional'})`)
      .join('\n');
    
    return `
# Estado atual da customização do sistema ${session.presetName}

## Tabelas incluídas:
${tables}

## Ação atual: ${session.currentAction || 'nenhuma'}
## Status: ${session.isCompleted ? 'Concluído' : 'Em andamento'}
    `;
  }
  
  /**
   * Atualiza as tabelas de uma sessão de customização
   * 
   * Este método foi adicionado para compatibilidade com interfaces anteriores
   * que usavam PersistentStateManager
   */
  public updateTables(sessionId: string, tables: ICustomizableTable[]): boolean {
    const session = this.activeCustomizations[sessionId];
    if (!session) {
      logger.error(`[StateManager] Não foi possível atualizar tabelas: sessão ${sessionId} não encontrada`);
      return false;
    }
    
    // Atualiza as tabelas diretamente no objeto da sessão
    session.tables = tables;
    logger.info(`[StateManager] Tabelas atualizadas na sessão ${sessionId}`);
    return true;
  }
}
