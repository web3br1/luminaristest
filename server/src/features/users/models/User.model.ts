/**
 * Role enum defining user access levels.
 * This is the source of truth for user roles in the domain.
 */
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

/**
 * Represents the core User entity within the application domain.
 * This interface decouples the application logic from the specific ORM (Prisma).
 */
export interface IUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  // Password hash is part of the data layer but not usually exposed in the core domain model
  // password?: string; // Optional: Include if needed in specific domain operations
  createdAt: Date;
  updatedAt: Date;
} 