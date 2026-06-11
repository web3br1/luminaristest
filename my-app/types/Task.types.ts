export interface Task {
  id: string;
  name: string;
  description: string | null;
  status: 'To_Do' | 'In_Progress' | 'Done' | 'Archived';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: any; // Permite outras propriedades dinâmicas
}

export const TaskStatus = {
  TO_DO: 'To_Do',
  IN_PROGRESS: 'In_Progress',
  DONE: 'Done',
  ARCHIVED: 'Archived',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
