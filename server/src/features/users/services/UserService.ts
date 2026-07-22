import type { IUserRepository } from '../repositories/IUserRepository';
import type { IUserPolicy } from '../policies/IUserPolicy';
import type { IVectorRepository } from '../../documents/repositories/IVectorRepository';
import { CreateUserDto, UpdateUserDto } from '../dtos/UserDto';
import bcrypt from 'bcryptjs';
import type { IUser } from '../models/User.model';
import { Role } from '../models/User.model';
import type { UserContext } from '../../../types/UserContext';
import { Prisma } from 'generated/prisma';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError, ConflictError } from '../../../lib/errors';
import logger from '../../../lib/logger';

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
    private userPolicy: IUserPolicy,
    private vectorRepository: IVectorRepository
  ) { }

  /**
   * Creates a new user
   * @param data - User creation data
   * @param actor - The user performing the action (null for public signup)
   * @returns Created user profile
   * @throws {ForbiddenError} If actor is not authorized
   * @throws {ConflictError} If username/email exists
   * @throws {ValidationError} If data is invalid
   */
  public async createUser(data: CreateUserDto, actor: UserContext | null = null): Promise<SafeUserProfile> {
    // Input is validated at the boundary (controller via DTO); the service trusts the typed input.

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
      throw new ConflictError('Username already exists', 'USERNAME_EXISTS');
    }
    const existingEmail = await this.userRepository.getUserByEmail(data.email);
    if (existingEmail) {
      throw new ConflictError('Email already exists', 'EMAIL_EXISTS');
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
      locale: newUser.locale,
      currency: newUser.currency,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };
  }

  /**
   * Verifies login credentials and returns the safe profile (no password) on success.
   * `identifier` is matched against username first, then email. Throws a single generic
   * UnauthorizedError for both "no such user" and "wrong password" to avoid user enumeration.
   * @throws {UnauthorizedError} If the identifier is unknown or the password does not match.
   */
  public async authenticate(identifier: string, password: string): Promise<SafeUserProfile> {
    const user =
      (await this.userRepository.getUserByUsername(identifier)) ??
      (await this.userRepository.getUserByEmail(identifier));

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return {
      id: user.id,
      name: user.name ?? '',
      username: user.username,
      email: user.email,
      role: user.role as Role,
      locale: user.locale,
      currency: user.currency,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
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
  public async getAllUsers(actor: UserContext | null, page?: number, limit?: number) {
    if (!this.userPolicy.canListAll(actor)) {
      throw new ForbiddenError('You are not authorized to list all users');
    }
    return this.userRepository.getAllUsers(page, limit);
  }

  /**
   * Retrieves a user by ID
   * @param id - User ID
   * @param actor - The user performing the action
   * @returns Safe user profile (no password); admins or the user themselves only
   * @throws {ForbiddenError} If actor is not authorized
   * @throws {NotFoundError} If user not found
   */
  public async getUserById(id: string, actor: UserContext | null): Promise<SafeUserProfile> {
    // canView grants access only to admins or the user themselves (tenant isolation).
    if (!this.userPolicy.canView(actor, id)) {
      throw new ForbiddenError('You are not authorized to view this user');
    }

    const user = await this.userRepository.getUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      name: user.name ?? '',
      username: user.username,
      email: user.email,
      role: user.role,
      locale: user.locale,
      currency: user.currency,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
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
  public async updateUser(id: string, data: UpdateUserDto, actor: UserContext | null): Promise<SafeUserProfile> {
    if (!actor) {
      throw new UnauthorizedError('Authentication required to update user');
    }
    if (!this.userPolicy.canUpdate(actor, id)) {
      throw new ForbiddenError('You are not authorized to update this user');
    }

    // Input is validated at the boundary (controller via DTO); the service trusts the typed input.
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
        // Prevent locking out the system by demoting the last remaining admin.
        // (Mirrors the deleteUser last-admin guard.)
        if (
          existingUser.role === Role.ADMIN &&
          data.role !== Role.ADMIN &&
          (await this.userRepository.countByRole(Role.ADMIN)) <= 1
        ) {
          throw new ValidationError('Cannot demote the last admin user.');
        }
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
      locale: updatedUser.locale,
      currency: updatedUser.currency,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  /**
   * Updates the authenticated user's own preferences (locale/currency).
   * Scoped to self by the caller; no role check required.
   */
  public async updatePreferences(userId: string, prefs: { locale?: string; currency?: string }) {
    return this.userRepository.updateUser(userId, prefs);
  }

  /**
   * Deletes a user
   * @param id - User ID
   * @param actor - The user performing the action
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If not authorized
   * @throws {NotFoundError} If user not found
   */
  public async deleteUser(id: string, actor: UserContext | null): Promise<void> {
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

    // Prevent locking out the system by deleting the last remaining admin.
    // Checked BEFORE the Qdrant purge so we never erase vectors for a delete we then refuse.
    if (user.role === Role.ADMIN && (await this.userRepository.countByRole(Role.ADMIN)) <= 1) {
      throw new ValidationError('Cannot delete the last admin user.');
    }

    // LGPD art.18 VI — right to erasure: purge Qdrant vectors BEFORE the SQL
    // delete.  If Qdrant fails we abort here and the user record is still intact
    // so the operation can be retried.  True distributed transactions are not
    // available between Qdrant and Postgres, so this ordering is the safest choice.
    logger.info('Deleting Qdrant vectors before user deletion (LGPD art.18 VI)', { userId: id });
    await this.vectorRepository.deleteVectorsByUserId(id);

    await this.userRepository.deleteUser(id);
  }
} 