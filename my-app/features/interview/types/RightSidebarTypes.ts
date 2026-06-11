export interface ITableField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  hidden?: boolean;
}

export interface ITable {
  conversationHistory: any[];
  key: string;
  name: string;
  description: string;
  fields?: ITableField[];
  isCore?: boolean;
}

export interface IAiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

export type InteractionMode = 'manual' | 'ai';

export interface RightSidebarProps {
  selectedTable: ITable | null;
  isVisible: boolean;
  sessionId: string | null;
  onUpdateTable?: (updatedTable: ITable) => void;
  presetKey: string | null;
}
