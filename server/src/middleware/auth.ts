import type { Request, Response, NextFunction } from 'express';
import { verifyToken, getAuthToken } from '@/lib/jwt';

// Protected API paths (prefix-based matching)
const protectedApiPaths = [
  '/api/documents',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/chat',
  '/api/users',
  '/api/chat-instances',
  '/api/chat-messages',
  '/api/dashboard-layout',
  '/api/dashboard',
  '/api/dynamic-tables',
  '/api/analytics',       // ← cobre /api/analytics e /api/analytics/definitions
  '/api/reports',         // ← cobre /api/reports/generate-chart-data
  '/api/structured-data', // ← cobre /api/structured-data/:documentId
  '/api/crm',             // ← cobre /api/crm/pipeline/*
  '/api/accounting',      // ← cobre /api/accounting/post e /reverse
  '/api/saved-views',     // ← saved table views (per-user)
];

// Admin-only API paths with method checks
const adminOnlyApiPaths: { path: string; method: string }[] = [
  { path: '/api/users', method: 'GET' },
  { path: '/api/users', method: 'DELETE' },
  { path: '/api/users/', method: 'DELETE' }, // /api/users/:id
];

function isPathProtected(pathname: string): boolean {
  return protectedApiPaths.some((p) => pathname.startsWith(p));
}

function isAdminOnly(pathname: string, method: string): boolean {
  return adminOnlyApiPaths.some((rule) => pathname.startsWith(rule.path) && method === rule.method);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pathname = req.originalUrl;
  const method = req.method;

  // Allow public user creation (POST /api/users)
  if (pathname === '/api/users' && method === 'POST') {
    return next();
  }

  if (!isPathProtected(pathname)) {
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
    const isUserUpdateOperation = pathname.startsWith('/api/users/') && (method === 'PUT' || method === 'PATCH');
    if (isUserUpdateOperation && payload.role !== 'ADMIN') {
      const pathParts = pathname.split('/');
      // If the route is /api/users/me/..., it's intrinsically a self-update
      const isMeRoute = pathParts.includes('me');
      
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
