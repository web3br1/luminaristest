import type { Request } from 'express';
import { Role } from '../features/users/models/User.model';
import type { UserContext } from '../types/UserContext';

/**
 * Extracts the authenticated user context from request headers injected by authMiddleware.
 * Throws if required fields are missing — call only on protected routes.
 */
export function getUserContext(req: Request): UserContext {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;
  const userEmail = (req.headers['x-user-email'] as string) || '';
  const userName = req.headers['x-user-name'] as string;
  const username = (req.headers['x-user-username'] as string) || '';

  if (!userId || !userRole) throw new Error('Missing user context');

  return {
    userId,
    id: userId,
    userRole,
    userEmail,
    userName: userName || undefined,
    email: userEmail,
    name: userName || '',
    username,
    role: userRole as Role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
