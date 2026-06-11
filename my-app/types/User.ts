import type { Role } from './Role';

export interface IUser {
  id: string;
  name: string | null;
  username: string;
  email: string;
  role: Role;
  locale?: string;
  currency?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type UpdateUserDto = Partial<{
  name: string;
  username: string;
  email: string;
  password: string;
  role: Role;
}>;


