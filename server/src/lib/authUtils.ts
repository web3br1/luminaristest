import { Role } from '../features/users/models/User.model';

// Define and export UserContext to match service expectations
export interface UserContext {
  userId: string; // Explicitly userId
  id: string; // Keep id for compatibility if IUser is used elsewhere as context
  name: string;
  username: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Retrieves the authenticated user context from an Express Request.
 * Assumes middleware has already verified the token/headers.
 */
export function getUserContextFromRequest(req: any): UserContext | null {
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
      userId: userId,
      name: name ?? '',
      username: username,
      email: email ?? '',
      role: role,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
    };
  }

  return null;
}