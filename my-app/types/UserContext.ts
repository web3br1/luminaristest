// Defines the shape of the user object available in the request context after authentication.
import { Role } from './Role';

export interface UserContext {
  userId: string;
  name: string | null;
  username: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
} 