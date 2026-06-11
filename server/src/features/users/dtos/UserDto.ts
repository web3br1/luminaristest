import { z } from 'zod';
import { Role } from '../models/User.model';

/**
 * Schema for user response
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required: [id, username, email, role, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         name: { type: string, nullable: true, maxLength: 100 }
 *         username: { type: string, minLength: 3, maxLength: 30 }
 *         email: { type: string, format: email }
 *         role: { type: string, enum: [USER, ADMIN] }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const UserSchema = z.object({
  id: z.string().cuid({ message: 'user.validation.idInvalidCuid' }),
  name: z.string().max(100, 'Name cannot exceed 100 characters').nullable(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(Role, { message: 'Invalid role' }),
  locale: z.string().default('en'),
  currency: z.string().default('BRL'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Schema for updating user
 * @openapi
 * components:
 *   schemas:
 *     UpdateUser:
 *       type: object
 *       properties:
 *         name: { type: string, maxLength: 100 }
 *         password: { type: string, minLength: 6 }
 *         role: { type: string, enum: [USER, ADMIN] }
 */
export const UpdateUserSchema = z.object({
  name: z.string()
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens')
    .optional(),
  email: z.string().email('Invalid email address').optional(),
  password: z.string()
    .min(6, 'Password must be at least 6 characters long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    )
    .optional(),
  role: z.nativeEnum(Role, { message: 'Invalid role' }).optional(),
  locale: z.enum(['en', 'pt']).optional(),
  currency: z.enum(['BRL', 'USD', 'EUR']).optional(),
});

/**
 * Schema for creating user
 * @openapi
 * components:
 *   schemas:
 *     CreateUser:
 *       type: object
 *       required: [name, username, email, password]
 *       properties:
 *         name: { type: string, maxLength: 100 }
 *         username: { type: string, minLength: 3, maxLength: 30 }
 *         email: { type: string, format: email }
 *         password: { type: string, minLength: 6 }
 *         role: { type: string, enum: [USER, ADMIN] }
 */
export const CreateUserSchema = z.object({
  name: z.string()
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  role: z.nativeEnum(Role, { message: 'Invalid role' }).optional(),
});

// Types derived from schemas
export type UserDto = z.infer<typeof UserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

/**
 * Type guard for UserDto
 * @param obj - Object to check
 * @returns True if object is a valid UserDto
 */
export function isUserDto(obj: unknown): obj is UserDto {
  return UserSchema.safeParse(obj).success;
}

/**
 * Type guard for UpdateUserDto
 * @param obj - Object to check
 * @returns True if object is a valid UpdateUserDto
 */
export function isUpdateUserDto(obj: unknown): obj is UpdateUserDto {
  return UpdateUserSchema.safeParse(obj).success;
}

/**
 * Type guard for CreateUserDto
 * @param obj - Object to check
 * @returns True if object is a valid CreateUserDto
 */
export function isCreateUserDto(obj: unknown): obj is CreateUserDto {
  return CreateUserSchema.safeParse(obj).success;
} 