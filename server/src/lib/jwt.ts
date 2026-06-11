import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { Request } from 'express';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-jwt-secret-key';
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN as any) || '7d';

interface JWTPayload {
  id: string;
  username: string;
  role: string;
}

export function generateToken(payload: JWTPayload): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
  return jwt.sign(payload as object, JWT_SECRET, options);
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
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
