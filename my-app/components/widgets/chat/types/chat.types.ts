export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  name?: string;
}

export interface BackendMessage {
  id: string;
  chatInstanceId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface ChatInstance {
  id: string;
  userId: string;
  widgetInstanceId: string;
  title: string | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface ChatInstanceSummary {
  id: string;
  title: string | null;
  widgetInstanceId: string;
  createdAt?: string; // Added for potential use in dropdowns
  updatedAt?: string; // Added for potential use in dropdowns
} 