import { Request, Response } from 'express';
// eslint-disable-next-line no-restricted-imports -- DEBT: prisma.* em controller, viola contrato §2 (só Repository). Backlog: docs/architecture/lint-layer-gate.md. Remover ao migrar para repository.
import prisma from '../lib/prisma';
import { handleApiError } from '../lib/apiUtils';
import { getFactory } from '@/lib/factory';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { z } from 'zod';
import { CreateUserSchema, UpdateUserSchema } from '@/features/users/dtos/UserDto';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count()
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages
      }
    });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = getUserContextFromRequest(req);
    const service = getFactory().getUserService();
    const user = await service.getUserById(id, actor);

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
    const { id } = req.params;
    const parse = UpdateUserSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() });

    const actor = getUserContextFromRequest(req);
    const service = getFactory().getUserService();
    // Use parse.data directly - any undefined fields are omitted
    const updated = await service.updateUser(id, parse.data, actor);

    return res.json(updated);
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = getUserContextFromRequest(req);

    const service = getFactory().getUserService();
    await service.deleteUser(id, actor);

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** Schema for preferences-only update */
const PreferencesSchema = z.object({
  locale: z.enum(['en', 'pt']).optional(),
  currency: z.enum(['BRL', 'USD', 'EUR']).optional(),
});

/**
 * PATCH /api/users/me/preferences
 * Updates the authenticated user's locale and/or currency preference.
 */
export const updateMyPreferences = async (req: Request, res: Response) => {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parse = PreferencesSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ success: false, error: parse.error.flatten() });
    }

    if (Object.keys(parse.data).length === 0) {
      return res.status(400).json({ success: false, error: 'No preferences provided' });
    }

    const updated = await prisma.user.update({
      where: { id: ctx.id },
      data: parse.data,
      select: { id: true, locale: true, currency: true },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, res);
  }
};
