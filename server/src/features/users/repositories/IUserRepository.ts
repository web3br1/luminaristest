import { Prisma } from 'generated/prisma';
import { Role } from '../models/User.model';

/**
 * Interface defining the contract for User data access operations.
 * All methods should handle data access and transformation consistently.
 */
export interface IUserRepository {
  /**
   * Creates a new user in the database.
   * @param data - User creation data
   * @returns The created user with all fields
   */
  createUser(data: Prisma.UserCreateInput): Promise<Prisma.UserGetPayload<{}>>;

  /**
   * Retrieves a paginated list of users.
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing users array and total count
   */
  getAllUsers(page?: number, limit?: number): Promise<{
    users: Array<{
      id: string;
      name: string | null;
      username: string;
      email: string;
      role: Role;
      locale: string;
      currency: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    totalCount: number;
  }>;

  /**
   * Retrieves a user by their ID.
   * @param id - User ID
   * @returns User without sensitive data or null if not found
   */
  getUserById(id: string): Promise<{
    id: string;
    name: string | null;
    username: string;
    email: string;
    role: Role;
    locale: string;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  } | null>;

  /**
   * Retrieves a user by their username.
   * @param username - Username to search for
   * @returns User with all fields including password or null if not found
   */
  getUserByUsername(username: string): Promise<{
    id: string;
    name: string | null;
    username: string;
    email: string;
    password: string;
    role: Role;
    locale: string;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  } | null>;

  /**
   * Retrieves a user by their email.
   * @param email - Email to search for
   * @returns User with all fields including password or null if not found
   */
  getUserByEmail(email: string): Promise<{
    id: string;
    name: string | null;
    username: string;
    email: string;
    password: string;
    role: Role;
    locale: string;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  } | null>;

  /**
   * Updates a user's information.
   * @param id - User ID
   * @param data - Update data
   * @returns Updated user without sensitive data
   */
  updateUser(id: string, data: Prisma.UserUpdateInput): Promise<{
    id: string;
    name: string | null;
    username: string;
    email: string;
    role: Role;
    locale: string;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }>;

  /**
   * Deletes a user from the database.
   * @param id - User ID
   * @returns The deleted user
   */
  deleteUser(id: string): Promise<Prisma.UserGetPayload<{}>>;

  /**
   * Counts users with the given role.
   * @param role - Role to count
   * @returns Number of users holding that role
   */
  countByRole(role: Role): Promise<number>;
}