/**
 * Auth helpers for tests.
 *
 * Mints real JWTs with the same secret + Bearer convention the production authMiddleware verifies
 * (lib/jwt). The token payload mirrors what lib/jwt.generateToken signs ({ id, username, role }),
 * plus optional email/name so the downstream `x-user-*` context is fully populated.
 */
import jwt from 'jsonwebtoken';
import { Role } from '@/features/users/models/User.model';
import type { UserContext } from '@/types/UserContext';

// Mirror lib/jwt's secret resolution (jest.setupEnv sets a 32+ char JWT_SECRET — lib/jwt fail-closes on shorter).
// Read LAZILY at sign time, not at module load: config/env.ts runs dotenv with override:true when the
// app module graph loads, replacing the setupEnv dummy with the real .env value — capturing the secret
// here at import time can race that and sign with a different secret than lib/jwt verifies with.
function jwtSecret(): string {
  return process.env.JWT_SECRET || 'test-secret-0123456789abcdef0123456789';
}

export interface TestActor {
  id: string;
  username: string;
  role?: Role;
  email?: string;
  name?: string;
}

/** Signs a Bearer-ready JWT for the given actor. */
export function signToken(actor: TestActor): string {
  return jwt.sign(
    {
      id: actor.id,
      username: actor.username,
      role: actor.role ?? Role.USER,
      email: actor.email,
      name: actor.name,
    },
    jwtSecret(),
    { expiresIn: '1h' }
  );
}

/** `{ Authorization: 'Bearer <jwt>' }` for `.set(...)` in supertest requests. */
export function authHeader(actor: TestActor): { Authorization: string } {
  return { Authorization: `Bearer ${signToken(actor)}` };
}

/** Builds a UserContext as the controller would resolve it — for direct service unit tests. */
export function ctxFor(actor: TestActor): UserContext {
  const email = actor.email ?? `${actor.username}@test.co`;
  const role = actor.role ?? Role.USER;
  return {
    id: actor.id,
    userId: actor.id,
    name: actor.name ?? actor.username,
    username: actor.username,
    email,
    role,
    userRole: role,
    userEmail: email,
    userName: actor.name ?? undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
