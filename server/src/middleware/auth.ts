import type { Request, Response, NextFunction } from 'express';
import { verifyToken, getAuthToken } from '@/lib/jwt';

/**
 * Identity headers this middleware injects for downstream handlers (getUserContext,
 * authUtils, AnalyticsResolver). They carry authority, so any copy arriving on the inbound
 * request is a client-supplied spoof and is dropped before routing (RISK-SEC-AUTH-001).
 *
 * `x-user-timezone` is deliberately NOT in this list: it is legitimately sent by the
 * frontend (my-app/lib/api/api-client.ts), is never injected here, and grants no authority.
 */
const INBOUND_IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-username',
  'x-user-role',
  'x-user-email',
  'x-user-name',
  'x-user-created-at',
  'x-user-updated-at',
] as const;

/**
 * Deny-by-default: every path under /api requires a valid JWT unless it is listed here.
 * Mounting a route grants no access — forgetting to list it fails closed (401), never open.
 *
 * Matching mirrors how Express matches: case-insensitive, trailing slash ignored, whole
 * segments, and NOT percent-decoded. That last one is deliberate — Express does not decode
 * when matching a mount path (verified against a live Express router: POST /api/ACCOUNTING/post
 * reaches the accounting router, while POST /api/%61ccounting/post 404s and never reaches it).
 * Decoding here would make this guard see a different path than the router does, and exactly
 * that kind of divergence produced RISK-SEC-AUTH-001. An encoded path matches no public rule
 * and is therefore denied.
 */
type PublicRule = { path: string; method: string; match: 'exact' | 'prefix' };

const publicApiRoutes: PublicRule[] = [
  { path: '/api', method: 'GET', match: 'exact' }, // API info banner
  { path: '/api/auth/login', method: 'POST', match: 'exact' },
  { path: '/api/auth/register', method: 'POST', match: 'exact' },
  { path: '/api/users', method: 'POST', match: 'exact' }, // public user registration
  { path: '/api/docs', method: 'GET', match: 'prefix' }, // swagger UI + openapi.json + static
];

// Admin-only API paths with method checks (prefix match covers /api/users/:id).
const adminOnlyApiPaths: { path: string; method: string }[] = [
  { path: '/api/users', method: 'GET' },
  { path: '/api/users', method: 'DELETE' },
];

/** Whole-segment prefix match: '/api/users' matches '/api/users/1' but never '/api/usersx'. */
function matchesSegmentPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

/**
 * Normalizes a request path for routing decisions the same way Express matches it:
 * query string dropped, case folded, trailing slashes removed.
 */
function normalizeForMatch(rawPath: string): string {
  const trimmed = rawPath.replace(/\/+$/, '');
  return (trimmed === '' ? '/' : trimmed).toLowerCase();
}

function isApiPath(pathname: string): boolean {
  return matchesSegmentPrefix(pathname, '/api');
}

/**
 * The method the router will actually dispatch on. Express serves HEAD from a GET handler
 * (verified: HEAD on a GET-only route returns 200; no other verb is derived), so every rule
 * keyed by method must fold it — a rule that reads the raw method sees `HEAD !== 'GET'` and
 * silently stops applying. Mirroring the router is the rule, and each function that matches a
 * method must use this: divergence from the router is what RISK-SEC-AUTH-001 was made of.
 */
function routedMethod(method: string): string {
  return method === 'HEAD' ? 'GET' : method;
}

function isPublic(pathname: string, method: string): boolean {
  const effectiveMethod = routedMethod(method);
  return publicApiRoutes.some(
    (rule) =>
      rule.method === effectiveMethod &&
      (rule.match === 'exact' ? pathname === rule.path : matchesSegmentPrefix(pathname, rule.path))
  );
}

function isAdminOnly(pathname: string, method: string): boolean {
  // Folded for the same reason as isPublic: without it, `HEAD /api/users` skipped this gate
  // entirely and the ADMIN-only handler ran for a USER token (200, with content-length as an
  // enumeration oracle). Same rule, both matchers — that symmetry is the invariant.
  const effectiveMethod = routedMethod(method);
  return adminOnlyApiPaths.some(
    (rule) => rule.method === effectiveMethod && matchesSegmentPrefix(pathname, rule.path)
  );
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Strip spoofable identity headers up front, before any routing decision. Runs for every
  // request, including public and non-/api ones — nothing downstream may trust a header this
  // middleware did not itself set.
  for (const header of INBOUND_IDENTITY_HEADERS) {
    delete req.headers[header];
  }

  const method = req.method;
  // Routing decisions use the folded path; the raw path is kept for the self-update
  // check, where a user id must be compared byte-for-byte (folding would corrupt it).
  const rawPath = req.path.replace(/\/+$/, '') || '/';
  const pathname = normalizeForMatch(req.path);

  if (!isApiPath(pathname) || isPublic(pathname, method)) {
    return next();
  }

  const token = getAuthToken(req);
  if (!token) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }

  try {
    const payload = verifyToken(token);

    // Inject user context headers for downstream handlers
    req.headers['x-user-id'] = String(payload.id || payload.userId || '');
    req.headers['x-user-role'] = String(payload.role || '');
    if (payload.email) req.headers['x-user-email'] = String(payload.email);
    if (payload.name) req.headers['x-user-name'] = String(payload.name);
    if (payload.username) req.headers['x-user-username'] = String(payload.username);

    // Admin-only enforcement
    if (isAdminOnly(pathname, method) && payload.role !== 'ADMIN') {
      console.warn(`[authMiddleware] 403: Admin access required for ${method} ${pathname}`);
      res.status(403).json({ code: 'FORBIDDEN', message: 'Admin access required' });
      return;
    }

    // User update rule: only self can update when not admin
    const isUserUpdateOperation =
      matchesSegmentPrefix(pathname, '/api/users') && (method === 'PUT' || method === 'PATCH');
    if (isUserUpdateOperation && payload.role !== 'ADMIN') {
      const pathParts = rawPath.split('/');
      // If the route is /api/users/me/..., it's intrinsically a self-update. Folded, because
      // Express routes /api/users/ME/preferences to the same handler — the id comparison below
      // is what must stay byte-exact, not this segment check.
      const isMeRoute = pathParts.some((p) => p.toLowerCase() === 'me');

      if (!isMeRoute) {
        const targetUserId = pathParts.pop();
        const currentUserId = String(payload.id || payload.userId || '');
        if (targetUserId !== currentUserId) {
          console.warn(`[authMiddleware] 403: Self-update only for ${method} ${pathname}`);
          res.status(403).json({ code: 'FORBIDDEN', message: 'You can only update your own profile' });
          return;
        }
      }
    }

    next();
  } catch (err: unknown) {
    console.error(`[authMiddleware] 401: Invalid or expired token for ${method} ${pathname}. Error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}
