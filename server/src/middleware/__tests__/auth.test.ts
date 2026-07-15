/**
 * Tests for auth middleware (R15).
 *
 * Covers: valid JWT, expired JWT, missing JWT, public/bypass paths, admin-only enforcement.
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

function makeReq(
  path: string,
  method: string = 'GET',
  authHeader?: string,
  extraHeaders?: Record<string, string>
): Partial<Request> {
  return {
    // Express derives `req.path` (query-stripped) from the URL; the middleware matches on it.
    path: path.split('?')[0],
    originalUrl: path,
    method,
    headers: { ...(authHeader ? { authorization: authHeader } : {}), ...(extraHeaders ?? {}) },
  };
}

function makeRes(): { res: Partial<Response>; statusCode: number | undefined; body: any } {
  const ctx: { statusCode: number | undefined; body: any } = {
    statusCode: undefined,
    body: undefined,
  };
  const res: Partial<Response> = {
    status(code: number) {
      ctx.statusCode = code;
      return this as Response;
    },
    json(data: any) {
      ctx.body = data;
      return this as Response;
    },
  };
  return { res, ...ctx };
}

function signToken(
  payload: object,
  options: jwt.SignOptions = {}
): string {
  return jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256', ...options });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  describe('valid JWT on a protected route', () => {
    it('calls next() and sets x-user-id header when Bearer token is valid', () => {
      const token = signToken({ id: 'user-123', username: 'alice', role: 'USER' });
      const req = makeReq('/api/chat', 'GET', `Bearer ${token}`);
      const { res, statusCode } = makeRes();
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // called with no error
      expect(req.headers!['x-user-id']).toBe('user-123');
      expect(statusCode).toBeUndefined(); // no status set
    });
  });

  describe('expired JWT', () => {
    it('returns 401 when the token is expired', () => {
      const token = signToken(
        { id: 'user-456', username: 'bob', role: 'USER' },
        { expiresIn: -1 } // already expired
      );
      const req = makeReq('/api/chat', 'GET', `Bearer ${token}`);
      const { res, statusCode, body } = makeRes();
      // capture updates via closure
      const ctx = { statusCode: undefined as number | undefined, body: undefined as any };
      const res2: Partial<Response> = {
        status(code: number) {
          ctx.statusCode = code;
          return this as Response;
        },
        json(data: any) {
          ctx.body = data;
          return this as Response;
        },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res2 as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
      expect(ctx.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('missing JWT on a protected route', () => {
    it('returns 401 when no Authorization header is present', () => {
      const req = makeReq('/api/documents', 'GET');
      const ctx = { statusCode: undefined as number | undefined, body: undefined as any };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json(data: any) { ctx.body = data; return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
      expect(ctx.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('public / bypass paths', () => {
    it('calls next() without checking JWT for a path not in the protected list', () => {
      // /api/healthz is not in protectedApiPaths
      const req = makeReq('/api/healthz', 'GET');
      const ctx = { statusCode: undefined as number | undefined };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json() { return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });

    it('calls next() for POST /api/users (public user registration bypass)', () => {
      const req = makeReq('/api/users', 'POST');
      const ctx = { statusCode: undefined as number | undefined };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json() { return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });
  });

  describe('RISK-SEC-AUTH-001 — case/encoding bypass + header spoofing', () => {
    it('treats an UPPERCASE protected path as protected (401 without token)', () => {
      // Before the fix, /api/ACCOUNTING/post skipped the guard (case-sensitive startsWith)
      // while Express routed it case-insensitively → unauthenticated access.
      const req = makeReq('/api/ACCOUNTING/post', 'POST');
      const ctx = { statusCode: undefined as number | undefined, body: undefined as any };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json(data: any) { ctx.body = data; return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('treats a percent-encoded protected path as protected (401 without token)', () => {
      const req = makeReq('/api/%61ccounting/post', 'POST'); // %61 = 'a'
      const ctx = { statusCode: undefined as number | undefined };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json() { return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(401);
    });

    it('strips client-supplied x-user-* identity headers even on an unprotected path', () => {
      const req = makeReq('/api/healthz', 'GET', undefined, {
        'x-user-id': 'attacker-victim-id',
        'x-user-username': 'victim',
        'x-user-role': 'ADMIN',
      });
      const ctx = { statusCode: undefined as number | undefined };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json() { return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      // The spoofed identity must not survive to downstream handlers.
      expect(req.headers!['x-user-id']).toBeUndefined();
      expect(req.headers!['x-user-username']).toBeUndefined();
      expect(req.headers!['x-user-role']).toBeUndefined();
    });

    it('overwrites spoofed x-user-* with the verified token identity on a protected route', () => {
      const token = signToken({ id: 'real-user', username: 'real', role: 'USER' });
      const req = makeReq('/api/accounting/post', 'POST', `Bearer ${token}`, {
        'x-user-id': 'attacker-victim-id',
        'x-user-role': 'ADMIN',
      });
      const { res } = makeRes();
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.headers!['x-user-id']).toBe('real-user'); // from token, not spoof
      expect(req.headers!['x-user-role']).toBe('USER');
    });
  });

  describe('admin-only route with non-admin token', () => {
    it('returns 403 when GET /api/users is accessed with a USER role token', () => {
      const token = signToken({ id: 'user-789', username: 'carol', role: 'USER' });
      const req = makeReq('/api/users', 'GET', `Bearer ${token}`);
      const ctx = { statusCode: undefined as number | undefined, body: undefined as any };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json(data: any) { ctx.body = data; return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.statusCode).toBe(403);
      expect(ctx.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('calls next() when GET /api/users is accessed with an ADMIN role token', () => {
      const token = signToken({ id: 'admin-001', username: 'admin', role: 'ADMIN' });
      const req = makeReq('/api/users', 'GET', `Bearer ${token}`);
      const ctx = { statusCode: undefined as number | undefined };
      const res: Partial<Response> = {
        status(code: number) { ctx.statusCode = code; return this as Response; },
        json() { return this as Response; },
      };
      const next: NextFunction = jest.fn();

      authMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.statusCode).toBeUndefined();
    });
  });
});
