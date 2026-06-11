/**
 * Represents the core ChatMessage entity within the application domain.
 * This interface decouples the application logic from the specific ORM (Prisma).
 */
export interface IChatMessage {
  id: string;
  content: string;
  role: ChatMessageRole;
  chatInstanceId: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
  // ChatInstance is loaded separately when needed
  // chatInstance?: IChatInstance;
}

/**
 * A simplified version of ChatMessage used for lists and summaries
 */
export interface IChatMessageSummary {
  id: string;
  content: string;
  role: ChatMessageRole;
  createdAt: Date;
}

// Added ChatMessageRole enum
export enum ChatMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
} 