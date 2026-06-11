import { ChatInstanceType } from 'generated/prisma';

/**
 * Represents the core ChatInstance entity within the application domain.
 * This interface decouples the application logic from the specific ORM (Prisma).
 */
export interface IChatInstance {
  id: string;
  widgetInstanceId: string;
  title: string | null;
  description?: string | null;
  type: ChatInstanceType;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  // Messages are loaded separately when needed
  // messages?: IChatMessage[];
}

/**
 * A simplified version of ChatInstance used for lists and summaries
 */
export interface IChatInstanceSummary {
  id: string;
  title: string | null;
  description?: string | null;
  type: ChatInstanceType;
  widgetInstanceId: string;
  createdAt: Date;
  updatedAt: Date;
} 