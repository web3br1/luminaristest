import { ICustomizableTable } from '../models/InterviewTypes';

/**
 * Define os tipos de dados específicos para o serviço de customização de campos.
 */

/**
 * Interface para um campo em uma tabela customizável
 */
export interface IField {
  /** Nome técnico do campo (ex: "customer_email") */
  name: string;
  /** Rótulo amigável para exibição (ex: "E-mail do Cliente") */
  label: string;
  /** Tipo de dado (ex: "email", "string", "number", "date") */
  type: string;
  /** Se o preenchimento é obrigatório */
  required?: boolean;
  /** Indicação se o campo está visível ou oculto */
  hidden?: boolean;
  /** Descrição ou dica para o usuário (opcional) */
  description?: string;
}

/**
 * Representa uma única modificação em um campo, conforme interpretado pela IA.
 */
export interface IFieldModification {
  /** Tipo de modificação a ser aplicada */
  action: 'add' | 'remove' | 'update';
  
  /** Propriedades do campo (utilizado em add/update) */
  field: IField;
  
  /** Nome original do campo (usado em update/remove) */
  originalFieldName?: string;
}

/**
 * Representa a resposta estruturada completa da IA após analisar o pedido do usuário.
 */
export interface IStructuredAiResponse {
  /** Lista de modificações a serem aplicadas */
  modifications: IFieldModification[];
  
  /** Mensagem amigável de resposta para o usuário */
  friendlyMessage: string;
}

/**
 * Interface para o resultado da customização de campos
 */
export interface IFieldCustomizationResult {
  conversationHistory: any[];
  /** Tabela atualizada com as modificações aplicadas */
  updatedTable: ICustomizableTable;
  
  /** Mensagem da IA para responder ao usuário */
  aiMessage: string;
  
  /** Indica se houve alguma modificação na tabela */
  modified: boolean;
}
