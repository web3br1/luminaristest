/**
 * Tests for auth middleware (R15).
 *
 * Covers: valid JWT, expired JWT, missing JWT, public routes, admin-only enforcement,
 * and the deny-by-default guarantees (RISK-SEC-AUTH-001): case-folded matching, ingress
 * stripping of forgeable identity headers, and unlisted routes failing closed.
 */

// Must set JWT_SECRET before any module that reads it at load time is imported.
const TEST_SECRET = 'test-secret-key-at-least-32-characters';
process.env.JWT_SECRET = TEST_SECRET;

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a request stub. `path` is what the middleware routes on (Express strips the
 * query string for it); `headers` may carry attacker-supplied values.
 */
function makeReq(
  path: string,
  method: string = 'GET',
  authHeader?: string,
  extraHeaders: Record<string, string> = {}
): Partial<Request> {
  return {
    // Express derives `req.path` (query-stripped) from the URL; the middleware matches on it.
    path: path.split('?')[0],
    originalUrl: path,
    method,
    headers: { ...(authHeader ? { authorization: authHeader } : {}), ...extraHeaders },
  };
}

function makeCtx() {
  const ctx = { statusCode: undefined as number | undefined, body: undefined as any };
  const res: Partial<Response> = {
    status(code: number) { ctx.statusCode = code; return this as Response; },
    json(data: any) { ctx.body = data; return this as Response; },
  };
  return { ctx, res };
}

function signToken(payload: object, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256', ...options });
}

/** Runs the middleware and returns what happened. */
function run(req: Partial<Request>) {
  const { ctx, res } = makeCtx();
  const next: NextFunction = jest.fn();
  authMiddleware(req as Request, res as Response, next);
  return { ctx, next };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  describe('valid JWT on a protected route', () => {
    it('calls next() and sets x-user-id header when Bearer token is valid', () => {
      const token = signToken({ id: 'user-123', username: 'alice', role: 'USER' });
      const req = makeReq('/api/chat', 'GET', `Bearer ${token}`);

      const { ctx, next } = run(req);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(req.headers!['x-user-id']).toBe('user-123');
      expect(ctx.statusCode).toBeUndefined();
    });
  });

  describe('expired JWT', () => {
    it('returns 401 when the token is expired', () => {
      const token = signToken({ id: 'user-456', username: 'bob', role: 'USER' }, { expiresIn: -1 });
      const { ctx, next } = run(makeReq('/api/chat', 'GET', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
      expect(ctx.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('missing JWT on a protected route', () => {
    it('returns 401 when no Authorization header is present', () => {
      const { ctx, next } = run(makeReq('/api/documents', 'GET'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
      expect(ctx.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  // -------------------------------------------------------------------------
  // RISK-SEC-AUTH-001 — deny-by-default
  // -------------------------------------------------------------------------

  describe('case-folded matching (was: case-sensitive prefix bypass)', () => {
    // Express routes case-insensitively, so /api/ACCOUNTING/post reached the accounting
    // router while a case-sensitive startsWith() check declared it unprotected.
    it.each([
      ['/api/ACCOUNTING/post', 'POST'],
      ['/api/Accounting/post', 'POST'],
      ['/API/accounting/post', 'POST'],
      ['/api/DOCUMENTS', 'GET'],
    ])('returns 401 for %s %s with no token', (path, method) => {
      const { ctx, next } = run(makeReq(path, method));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });
  });

  describe('unlisted routes fail closed', () => {
    it('returns 401 for /api/package-balances, which no allowlist ever named', () => {
      const { ctx, next } = run(makeReq('/api/package-balances', 'GET'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('returns 401 for a route that does not exist yet', () => {
      const { ctx, next } = run(makeReq('/api/some-future-module', 'POST'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('returns 401 despite a trailing slash', () => {
      const { ctx, next } = run(makeReq('/api/accounting/', 'POST'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('returns 401 for a percent-encoded protected path', () => {
      // Kept from the #118 hardening. Under deny-by-default it passes for a different reason:
      // this guard does NOT decode (Express does not decode when matching a mount path, so
      // /api/%61ccounting/post 404s rather than reaching the router). The encoded path simply
      // matches no public rule and is denied. The property holds either way — pin it.
      const { ctx, next } = run(makeReq('/api/%61ccounting/post', 'POST'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('a query string never affects the routing decision', () => {
      const { ctx, next } = run(makeReq('/api/accounting/post?unit=1', 'POST'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });
  });

  describe('ingress stripping of forgeable identity headers', () => {
    it('rejects a tokenless request carrying forged identity headers', () => {
      const req = makeReq('/api/accounting/post', 'POST', undefined, {
        'x-user-id': 'victim-tenant',
        'x-user-role': 'ADMIN',
      });
      const { ctx, next } = run(req);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
      expect(req.headers!['x-user-id']).toBeUndefined();
      expect(req.headers!['x-user-role']).toBeUndefined();
    });

    it('strips forged identity headers even on a public route', () => {
      const req = makeReq('/api/auth/login', 'POST', undefined, {
        'x-user-id': 'victim-tenant',
        'x-user-role': 'ADMIN',
      });
      const { next } = run(req);

      expect(next).toHaveBeenCalledTimes(1); // login stays public
      expect(req.headers!['x-user-id']).toBeUndefined();
      expect(req.headers!['x-user-role']).toBeUndefined();
    });

    it('strips forged identity headers on non-/api routes too', () => {
      const req = makeReq('/health', 'GET', undefined, { 'x-user-id': 'victim-tenant' });
      const { next } = run(req);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.headers!['x-user-id']).toBeUndefined();
    });

    it('a forged identity header cannot survive alongside a valid token', () => {
      const token = signToken({ id: 'real-user', username: 'alice', role: 'USER' });
      const req = makeReq('/api/chat', 'GET', `Bearer ${token}`, {
        'x-user-id': 'victim-tenant',
        'x-user-role': 'ADMIN',
      });
      const { next } = run(req);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.headers!['x-user-id']).toBe('real-user'); // token wins, not the header
      expect(req.headers!['x-user-role']).toBe('USER');
    });

    it('does NOT strip x-user-timezone — it is client-supplied and carries no authority', () => {
      const token = signToken({ id: 'user-123', username: 'alice', role: 'USER' });
      const req = makeReq('/api/analytics', 'GET', `Bearer ${token}`, {
        'x-user-timezone': 'America/Sao_Paulo',
      });
      const { next } = run(req);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.headers!['x-user-timezone']).toBe('America/Sao_Paulo');
    });
  });

  describe('public routes', () => {
    it.each([
      ['/api', 'GET'],
      ['/api/auth/login', 'POST'],
      ['/api/auth/register', 'POST'],
      ['/api/users', 'POST'],
      ['/api/docs', 'GET'],
      ['/api/docs/openapi.json', 'GET'],
    ])('calls next() without a token for %s %s', (path, method) => {
      const { ctx, next } = run(makeReq(path, method));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it.each([
      ['/api/docs/openapi.json'],
      ['/api'],
    ])('keeps HEAD %s public, because Express serves HEAD from the GET handler', (path) => {
      const { ctx, next } = run(makeReq(path, 'HEAD'));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('does not let HEAD reach a protected route without a token', () => {
      const { ctx, next } = run(makeReq('/api/accounting/post', 'HEAD'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('calls next() for non-/api paths such as /health', () => {
      const { ctx, next } = run(makeReq('/health', 'GET'));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('does not let a public rule leak to a neighbouring segment', () => {
      // '/api/docs' is public by prefix; '/api/docsomething' must not inherit that.
      const { ctx, next } = run(makeReq('/api/docsomething', 'GET'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('keeps public rules method-scoped: GET /api/users still needs a token', () => {
      const { ctx, next } = run(makeReq('/api/users', 'GET'));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });
  });

  describe('admin-only route with non-admin token', () => {
    it('returns 403 when GET /api/users is accessed with a USER role token', () => {
      const token = signToken({ id: 'user-789', username: 'carol', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/users', 'GET', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
      expect(ctx.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('calls next() when GET /api/users is accessed with an ADMIN role token', () => {
      const token = signToken({ id: 'admin-001', username: 'admin', role: 'ADMIN' });
      const { ctx, next } = run(makeReq('/api/users', 'GET', `Bearer ${token}`));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('returns 403 for DELETE /api/users/:id with a USER role token', () => {
      const token = signToken({ id: 'user-789', username: 'carol', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/users/other-id', 'DELETE', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
    });

    it.each([
      ['/api/users'],
      ['/api/users/other-id'],
    ])('returns 403 for HEAD %s with a USER token — HEAD must not skip the admin gate', (path) => {
      // Express serves HEAD from the GET handler, so a raw `rule.method === method` check let
      // HEAD sail past isAdminOnly and run the ADMIN-only handler for a non-admin (content-length
      // then leaks as a user-enumeration oracle). isAdminOnly folds HEAD→GET like isPublic does.
      const token = signToken({ id: 'user-789', username: 'carol', role: 'USER' });
      const { ctx, next } = run(makeReq(path, 'HEAD', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
    });

    it('allows HEAD /api/users with an ADMIN token', () => {
      const token = signToken({ id: 'admin-001', username: 'admin', role: 'ADMIN' });
      const { ctx, next } = run(makeReq('/api/users', 'HEAD', `Bearer ${token}`));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('admin-only matching is case-folded too', () => {
      const token = signToken({ id: 'user-789', username: 'carol', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/USERS', 'GET', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
    });
  });

  describe('self-update rule', () => {
    it('allows a user to update their own profile', () => {
      const token = signToken({ id: 'user-abc', username: 'alice', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/users/user-abc', 'PUT', `Bearer ${token}`));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('returns 403 when a user targets someone else', () => {
      const token = signToken({ id: 'user-abc', username: 'alice', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/users/user-xyz', 'PUT', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
    });

    it('compares the user id byte-for-byte, not case-folded', () => {
      // Routing folds case; identity must not. A mixed-case id has to still match itself.
      const token = signToken({ id: 'User-AbC', username: 'alice', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/users/User-AbC', 'PUT', `Bearer ${token}`));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it.each([
      ['/api/users/me/preferences'],
      ['/api/users/ME/preferences'],
      ['/api/USERS/me/preferences'],
    ])('allows PATCH %s — Express routes them all to the same handler', (path) => {
      const token = signToken({ id: 'user-abc', username: 'alice', role: 'USER' });
      const { ctx, next } = run(makeReq(path, 'PATCH', `Bearer ${token}`));

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('a mixed-case id still cannot target someone else via the me-route check', () => {
      // The `me` segment check folds case; the id comparison must not — otherwise
      // `PUT /api/users/User-AbC` by `user-abc` would escalate (the latent bug in #118).
      const token = signToken({ id: 'user-abc', username: 'alice', role: 'USER' });
      const { ctx, next } = run(makeReq('/api/users/User-AbC', 'PUT', `Bearer ${token}`));

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
    });
  });
});
