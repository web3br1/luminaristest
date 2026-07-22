import { z } from 'zod';
import { Role } from '../models/User.model';

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

/**
 * Query schema for the paginated user list. Caps `limit` to protect against unbounded reads.
 */
export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

/**
 * Schema for the authenticated user's own preferences update (locale/currency).
 */
export const UpdatePreferencesSchema = z.object({
  locale: z.enum(['en', 'pt']).optional(),
  currency: z.enum(['BRL', 'USD', 'EUR']).optional(),
});
export type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>;

/**
 * Schema for login. `identifier` is a username OR email; `username`/`email` are accepted as aliases
 * for backward compatibility. At least one identifier plus a password is required.
 */
export const LoginSchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((d) => Boolean(d.identifier || d.username || d.email), {
    message: 'identifier, username or email is required',
    path: ['identifier'],
  });
export type LoginDto = z.infer<typeof LoginSchema>;

// Types derived from schemas
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;