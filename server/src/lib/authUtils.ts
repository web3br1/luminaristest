// Server version: remove Next.js types
export interface NextApiRequest {
  cookies: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
}
export interface NextRequest {
  cookies: {
    get: (name: string) => { value: string } | undefined;
  };
}
import { jwtVerify, JWTPayload } from 'jose';
import { UserRepository } from '../features/users/repositories/UserRepository';
import type { IUser } from '../features/users/models/User.model';
import { Role } from '../features/users/models/User.model';
import { UnauthorizedError } from './errors';

const JWT_SECRET = process.env.JWT_SECRET;
const userRepository = new UserRepository();

interface AuthenticatedUserPayload extends JWTPayload {
  userId: string;
  username: string;
  role: Role;
}

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
 * Verifies the auth token from the request cookies and fetches the authenticated user.
 * Returns the user object (IUser) or throws UnauthorizedError if not authenticated.
 */
export async function getAuthenticatedUser(req: NextApiRequest): Promise<IUser> {
  const token = req.cookies.auth_token;

  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }

  if (!JWT_SECRET) {
    throw new UnauthorizedError('JWT_SECRET not set');
  }

  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey) as { payload: AuthenticatedUserPayload };

    if (!payload.userId || !payload.username || !payload.role) {
      throw new UnauthorizedError('Invalid token payload');
    }

    const user = await userRepository.getUserById(payload.userId);

    if (!user || user.role !== payload.role) {
      throw new UnauthorizedError('User not found or role mismatch');
    }

    return {
      id: user.id,
      name: user.name ?? '',
      username: user.username ?? '',
      email: user.email,
      role: user.role as Role,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    };

  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Adapter function for Next.js App Router.
 * Extracts the token from a NextRequest and uses getAuthenticatedUser.
 */
export async function getCurrentUser(req: NextRequest): Promise<IUser> {
  const token = req.cookies.get('auth_token')?.value;

  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }

  // Adapt NextRequest to a simplified NextApiRequest for getAuthenticatedUser
  const adaptedReq = {
    cookies: {
      auth_token: token,
    },
  } as unknown as NextApiRequest;

  return getAuthenticatedUser(adaptedReq);
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