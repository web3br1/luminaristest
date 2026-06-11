import prisma from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { Role } from '../models/User.model';
import { IUserRepository } from './IUserRepository';

/**
 * Repository implementation for User data access operations.
 * Handles all database interactions for the User entity.
 */
export class UserRepository implements IUserRepository {
  /**
   * Converts Prisma Role to domain Role
   */
  public convertRole(prismaRole: string): Role {
    return prismaRole as Role;
  }

  /**
   * Creates a new user in the database.
   * @param data - User creation data
   * @returns The created user with all fields
   */
  public async createUser(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data,
    });
  }

  /**
   * Retrieves a paginated list of users.
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing users array and total count
   */
  public async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const take = limit;

    const [users, totalCount] = await prisma.$transaction([
      prisma.user.findMany({
        skip,
        take,
        // Exclude password from the result
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          locale: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc', // Default ordering
        },
      }),
      prisma.user.count(),
    ]);

    return {
      users: users.map(user => ({
        ...user,
        role: this.convertRole(user.role),
      })),
      totalCount,
    };
  }

  /**
   * Retrieves a user by their ID.
   * @param id - User ID
   * @returns User without sensitive data or null if not found
   */
  public async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        locale: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) return null;

    return {
      ...user,
      role: this.convertRole(user.role),
    };
  }

  /**
   * Retrieves a user by their username.
   * @param username - Username to search for
   * @returns User with all fields including password or null if not found
   */
  public async getUserByUsername(username: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        password: true, // Password needed for auth
        role: true,
        locale: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) return null;

    return {
      ...user,
      role: this.convertRole(user.role),
    };
  }

  /**
   * Retrieves a user by their email.
   * @param email - Email to search for
   * @returns User with all fields including password or null if not found
   */
  public async getUserByEmail(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        password: true, // Password needed for auth
        role: true,
        locale: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) return null;

    return {
      ...user,
      role: this.convertRole(user.role),
    };
  }

  /**
   * Updates a user's information.
   * @param id - User ID
   * @param data - Update data
   * @returns Updated user without sensitive data
   */
  public async updateUser(id: string, data: Prisma.UserUpdateInput) {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { // Return updated user without password
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        locale: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...user,
      role: this.convertRole(user.role),
    };
  }

  /**
   * Deletes a user from the database.
   * @param id - User ID
   * @returns The deleted user
   */
  public async deleteUser(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  }
}

// Type helper for the user object returned by auth lookups
export type UserWithAuthData = Prisma.UserGetPayload<{
  select: {
    id: true,
    name: true,
    username: true,
    email: true,
    password: true,
    role: true,
    locale: true,
    currency: true,
    createdAt: true,
    updatedAt: true,
  }
}>; 