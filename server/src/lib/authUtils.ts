import type { Request } from 'express';
import { Role } from '../features/users/models/User.model';
import type { UserContext } from '../types/UserContext';

// Re-export canonical UserContext from types — single source of truth (R35)
export type { UserContext } from '../types/UserContext';

/**
 * Retrieves the authenticated user context from an Express Request.
 * Assumes middleware has already verified the token/headers.
 */
export function getUserContextFromRequest(req: Request): UserContext | null {
  const userId = req.headers['x-user-id'] as string;
  const username = req.headers['x-user-username'] as string;
  const email = req.headers['x-user-email'] as string;
  const role = req.headers['x-user-role'] as Role;
  const name = req.headers['x-user-name'] as string;
  const createdAt = req.headers['x-user-created-at'] as string;
  const updatedAt = req.headers['x-user-updated-at'] as string;

  if (userId && username && role) {
    return {
      id: userId,
      userId,
      name: name ?? '',
      username,
      email: email ?? '',
      role,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
      userRole: role,
      userEmail: email ?? '',
      userName: name ?? undefined,
    };
  }

  return null;
}