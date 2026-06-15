import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { Request } from 'express';

const _rawSecret = process.env.JWT_SECRET;
if (!_rawSecret) {
  throw new Error('[FATAL] JWT_SECRET environment variable is not set. Cannot start server.');
}
if (_rawSecret.length < 32) {
  throw new Error('[FATAL] JWT_SECRET must be at least 32 characters');
}
const JWT_SECRET: Secret = _rawSecret;
const JWT_EXPIRES_IN = ((process.env.JWT_EXPIRES_IN as string | undefined) || '7d') as SignOptions['expiresIn'];

interface JWTPayload {
  id: string;
  username: string;
  role: string;
  userId?: string;
  email?: string;
  name?: string;
}

export function generateToken(payload: JWTPayload): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' };
  return jwt.sign(payload as object, JWT_SECRET, options);
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
}

export function getAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    let token = authHeader.split(' ')[1]?.trim();
    // Strip potential quotes if present (some clients add them)
    if (token && token.startsWith('"') && token.endsWith('"')) {
      token = token.substring(1, token.length - 1);
    }
    if (token) {
      return token;
    }
  }
  // Fallback: try reading from cookies if Authorization header is missing
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    try {
      const cookies = cookieHeader.split(';').map((c) => c.trim());
      const authCookie = cookies.find((c) => c.startsWith('auth_token='));
      if (authCookie) {
        let token = decodeURIComponent(authCookie.split('=')[1] || '').trim();
        // Strip potential quotes
        if (token.startsWith('"') && token.endsWith('"')) {
          token = token.substring(1, token.length - 1);
        }
        if (token) {
          return token;
        }
      }
    } catch (e) {
      console.error('[jwt] Error parsing cookies:', e);
    }
  }
  return undefined;
}
