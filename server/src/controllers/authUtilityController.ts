import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';

export async function me(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const user = await getFactory().getUserRepository().getUserById(ctx.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.json({ success: true, data: user });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function logout(req: Request, res: Response) {
  try {
    res.clearCookie('auth_token', { path: '/', sameSite: 'lax' });
    res.clearCookie('auth_token', { path: '/', sameSite: 'lax', httpOnly: true });
    return res.json({ success: true });
  } catch (error) {
    return handleApiError(error, res);
  }
}
