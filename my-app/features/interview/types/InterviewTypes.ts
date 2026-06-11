export interface IMessage {
  sender: 'user' | 'ai';
  text: string;
}

export interface ITableField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  hidden?: boolean;
}

export interface ITable {
  key: string;
  name: string;
  description: string;
  fields?: ITableField[];
  isCore?: boolean;
}

export interface ICustomizationState {
  presetKey: string;
  presetName: string;
  tables: ITable[];
}
