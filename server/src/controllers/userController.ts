import { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '../lib/apiUtils';
import { getFactory } from '@/lib/factory';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { CreateUserSchema, UpdateUserSchema, ListUsersQuerySchema, UpdatePreferencesSchema } from '@/features/users/dtos/UserDto';

const UserIdSchema = z.object({ id: z.string().cuid({ message: 'Invalid user ID format' }) });

export const getUsers = async (req: Request, res: Response) => {
  try {
    const actor = getUserContextFromRequest(req);
    const parsed = ListUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const { page, limit } = parsed.data;

    // Goes through the service so the ADMIN policy (canListAll) is enforced.
    const { users, totalCount } = await getFactory().getUserService().getAllUsers(actor, page, limit);

    return res.json({
      success: true,
      data: users,
      total: totalCount,
      page,
      pageSize: limit,
    });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const parsed = UserIdSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const actor = getUserContextFromRequest(req);
    const service = getFactory().getUserService();
    const user = await service.getUserById(parsed.data.id, actor);

    return res.json({ success: true, data: user });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const parse = CreateUserSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() });

    const actor = getUserContextFromRequest(req); // public signup when unauthenticated

    const service = getFactory().getUserService();
    const created = await service.createUser(parse.data, actor);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const idParsed = UserIdSchema.safeParse(req.params);
    if (!idParsed.success) return res.status(400).json({ success: false, error: idParsed.error.flatten() });

    const parse = UpdateUserSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() });

    const actor = getUserContextFromRequest(req);
    const service = getFactory().getUserService();
    // Use parse.data directly - any undefined fields are omitted
    const updated = await service.updateUser(idParsed.data.id, parse.data, actor);

    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const parsed = UserIdSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const actor = getUserContextFromRequest(req);

    const service = getFactory().getUserService();
    await service.deleteUser(parsed.data.id, actor);

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/**
 * PATCH /api/users/me/preferences
 * Updates the authenticated user's locale and/or currency preference.
 */
export const updateMyPreferences = async (req: Request, res: Response) => {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parse = UpdatePreferencesSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ success: false, error: parse.error.flatten() });
    }

    if (Object.keys(parse.data).length === 0) {
      return res.status(400).json({ success: false, error: 'No preferences provided' });
    }

    const updated = await getFactory().getUserService().updatePreferences(ctx.userId, parse.data);

    return res.json({ success: true, data: { id: updated.id, locale: updated.locale, currency: updated.currency } });
  } catch (error) {
    return handleApiError(error, res);
  }
};
