import type { IUserRepository } from '../repositories/IUserRepository';
import type { IUserPolicy } from '../policies/IUserPolicy';
import { CreateUserDto, UpdateUserDto, UserDto, isCreateUserDto, isUpdateUserDto } from '../dtos/UserDto';
import bcrypt from 'bcryptjs';
import type { IUser } from '../models/User.model';
import { Role } from '../models/User.model';
import { Prisma } from 'generated/prisma';
import { ServiceError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../lib/errors';

/**
 * Public user profile type - minimal user information for public viewing
 */
export interface PublicUserProfile {
  id: string;
  name: string;
  username: string;
}

/**
 * Safe user profile type - full user information excluding sensitive data
 */
export type SafeUserProfile = Omit<IUser, 'password'>;

export class UserService {
  constructor(
    private userRepository: IUserRepository,
    private userPolicy: IUserPolicy
  ) { }

  /**
   * Creates a new user
   * @param data - User creation data
   * @param actor - The user performing the action (null for public signup)
   * @returns Created user profile
   * @throws {ForbiddenError} If actor is not authorized
   * @throws {ServiceError} If username/email exists
   * @throws {ValidationError} If data is invalid
   */
  public async createUser(data: CreateUserDto, actor: IUser | null = null): Promise<SafeUserProfile> {
    // Validate DTO
    if (!isCreateUserDto(data)) {
      throw new ValidationError('Invalid user creation data');
    }

    // Check permissions
    if (actor && !this.userPolicy.canCreate(actor)) {
      throw new ForbiddenError('You are not authorized to create users');
    }
    if (!actor && !this.userPolicy.canCreate(null)) {
      throw new ForbiddenError('Public user creation is not allowed');
    }

    // Check uniqueness
    const existingUsername = await this.userRepository.getUserByUsername(data.username);
    if (existingUsername) {
      throw new ServiceError('Username already exists', 'USERNAME_EXISTS');
    }
    const existingEmail = await this.userRepository.getUserByEmail(data.email);
    if (existingEmail) {
      throw new ServiceError('Email already exists', 'EMAIL_EXISTS');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Determine role
    let roleToSet = data.role || Role.USER;
    if (roleToSet === Role.ADMIN && (!actor || actor.role !== Role.ADMIN)) {
      roleToSet = Role.USER;
    }

    // Create user
    const newUser = await this.userRepository.createUser({
      ...data,
      password: hashedPassword,
      role: roleToSet
    });

    // Return safe profile
    return {
      id: newUser.id,
      name: newUser.name ?? '',
      username: newUser.username,
      email: newUser.email,
      role: newUser.role as Role,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };
  }

  /**
   * Retrieves a paginated list of users
   * @param actor - The user performing the action
   * @param page - Page number (1-based)
   * @param limit - Items per page
   * @returns Paginated list of users
   * @throws {ForbiddenError} If actor is not authorized
   */
  public async getAllUsers(actor: IUser | null, page?: number, limit?: number) {
    if (!this.userPolicy.canListAll(actor)) {
      throw new ForbiddenError('You are not authorized to list all users');
    }
    return this.userRepository.getAllUsers(page, limit);
  }

  /**
   * Retrieves a user by ID
   * @param id - User ID
   * @param actor - The user performing the action
   * @returns User profile (full or public based on permissions)
   * @throws {ForbiddenError} If actor is not authorized
   * @throws {NotFoundError} If user not found
   */
  public async getUserById(id: string, actor: IUser | null): Promise<SafeUserProfile | PublicUserProfile> {
    if (!this.userPolicy.canView(actor, id)) {
      throw new ForbiddenError('You are not authorized to view this user');
    }

    const user = await this.userRepository.getUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Return full profile for admin or self
    if (actor && (actor.role === Role.ADMIN || actor.id === id)) {
      return {
        id: user.id,
        name: user.name ?? '',
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }

    // Return public profile for others
    return {
      id: user.id,
      name: user.name ?? '',
      username: user.username,
    };
  }

  /**
   * Updates a user
   * @param id - User ID
   * @param data - Update data
   * @param actor - The user performing the action
   * @returns Updated user profile
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If not authorized
   * @throws {NotFoundError} If user not found
   * @throws {ValidationError} If data is invalid
   */
  public async updateUser(id: string, data: UpdateUserDto, actor: IUser | null): Promise<SafeUserProfile> {
    if (!actor) {
      throw new UnauthorizedError('Authentication required to update user');
    }
    if (!this.userPolicy.canUpdate(actor, id)) {
      throw new ForbiddenError('You are not authorized to update this user');
    }

    // Validate DTO
    if (!isUpdateUserDto(data)) {
      throw new ValidationError('Invalid user update data');
    }

    const existingUser = await this.userRepository.getUserById(id);
    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    const updateData: Prisma.UserUpdateInput = {};

    // Handle name update
    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    // Handle role update
    if (data.role !== undefined) {
      if (this.userPolicy.canChangeRole(actor)) {
        updateData.role = data.role;
      } else if (existingUser.role !== data.role) {
        throw new ForbiddenError('You are not authorized to change user roles');
      }
    }

    // Handle email update
    if (data.email !== undefined) {
      updateData.email = data.email;
    }

    // Handle username update
    if (data.username !== undefined) {
      updateData.username = data.username;
    }

    // Handle password update
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Validate update data
    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No valid update fields provided');
    }

    const updatedUser = await this.userRepository.updateUser(id, updateData);
    return {
      id: updatedUser.id,
      name: updatedUser.name ?? '',
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  /**
   * Deletes a user
   * @param id - User ID
   * @param actor - The user performing the action
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If not authorized
   * @throws {NotFoundError} If user not found
   */
  public async deleteUser(id: string, actor: IUser | null): Promise<void> {
    if (!actor) {
      throw new UnauthorizedError('Authentication required to delete user');
    }
    if (!this.userPolicy.canDelete(actor, id)) {
      throw new ForbiddenError('You are not authorized to delete this user');
    }

    const user = await this.userRepository.getUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    await this.userRepository.deleteUser(id);
  }
} 