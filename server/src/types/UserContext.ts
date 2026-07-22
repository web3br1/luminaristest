// Canonical UserContext shared across services, policies, and controllers.
// This is the single source of truth — authUtils.ts re-exports from here.
import { Role } from '../features/users/models/User.model';

/**
 * Authenticated user context attached to a request after auth.
 */
export interface UserContext {
  /** Primary user identifier (same as id, provided for clarity in service calls) */
  userId: string;
  /** Alias for userId — kept for services that reference ctx.id */
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
  /** Alias for role — provided for compatibility with R35 header-based extraction */
  userRole: string;
  /** Alias for email */
  userEmail: string;
  /** Alias for name */
  userName?: string;
  /** From x-user-timezone header (injected by the API client) */
  timeZone?: string;
}
