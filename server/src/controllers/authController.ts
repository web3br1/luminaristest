import { Request, Response } from 'express';
import { handleApiError } from '../lib/apiUtils';
import { generateToken } from '../lib/jwt';
import { getFactory } from '@/lib/factory';
import { CreateUserSchema, LoginSchema } from '@/features/users/dtos/UserDto';

/**
 * POST /api/auth/register — public signup.
 * Validates with the same DTO as POST /api/users and delegates to UserService.createUser, so both
 * signup paths share one set of rules (uniqueness → 409, password hashing, role downgrade).
 * Response contract: { success, data: { user, token } }.
 */
export const register = async (req: Request, res: Response) => {
  try {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const user = await getFactory().getUserService().createUser(parsed.data, null);
    const token = generateToken({ id: user.id, username: user.username, role: user.role });

    return res.status(201).json({ success: true, data: { user, token } });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/**
 * POST /api/auth/login.
 * Verifies credentials via UserService.authenticate (no Prisma in the controller) and issues a JWT.
 * Response contract: { success, data: { user, token } }.
 */
export const login = async (req: Request, res: Response) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const { identifier, username, email, password } = parsed.data;
    const loginId = (identifier ?? username ?? email) as string;

    const user = await getFactory().getUserService().authenticate(loginId, password);
    const token = generateToken({ id: user.id, username: user.username, role: user.role });

    return res.json({ success: true, data: { user, token } });
  } catch (error) {
    return handleApiError(error, res);
  }
};
