import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { CreateChatInstanceSchema, UpdateChatInstanceSchema, ListChatInstancesQuerySchema, GetOrCreateChatInstanceSchema, mapToDto } from '@/features/chatInstances/dtos/ChatInstanceDto';

const ChatInstanceIdSchema = z.object({ id: z.string().cuid({ message: 'Invalid chat instance ID format' }) });

export async function listChatInstances(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = ListChatInstancesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const { page, limit, type } = parsed.data;
    const svc = getFactory().getChatInstanceService();

    if (type) {
      const instances = await svc.getInstancesByUser(ctx, type);
      return res.status(200).json({ success: true, data: instances, total: instances.length, page: 1, pageSize: instances.length });
    }

    const { instances, totalCount } = await svc.getAllInstances(ctx, page, limit);
    return res.status(200).json({ success: true, data: instances, total: totalCount, page, pageSize: limit });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const bodyResult = CreateChatInstanceSchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ success: false, error: bodyResult.error.flatten() });

    const svc = getFactory().getChatInstanceService();
    const newInstance = await svc.createInstance(bodyResult.data, ctx);
    return res.status(201).json({ success: true, data: mapToDto(newInstance) });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const idParsed = ChatInstanceIdSchema.safeParse(req.params);
    if (!idParsed.success) return res.status(400).json({ success: false, error: idParsed.error.flatten() });

    const bodyResult = UpdateChatInstanceSchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ success: false, error: bodyResult.error.flatten() });

    const svc = getFactory().getChatInstanceService();
    const updatedInstance = await svc.updateInstance(idParsed.data.id, bodyResult.data, ctx);
    return res.status(200).json({ success: true, data: mapToDto(updatedInstance) });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const idParsed = ChatInstanceIdSchema.safeParse(req.params);
    if (!idParsed.success) return res.status(400).json({ success: false, error: idParsed.error.flatten() });

    const svc = getFactory().getChatInstanceService();
    await svc.deleteInstance(idParsed.data.id, ctx);
    return res.status(200).json({ success: true, message: 'Chat instance deleted' });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function getOrCreateChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const bodyResult = GetOrCreateChatInstanceSchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ success: false, error: bodyResult.error.flatten() });

    const { widgetInstanceId, type } = bodyResult.data;
    const svc = getFactory().getChatInstanceService();
    const instance = await svc.getOrCreateInstance(widgetInstanceId, type, ctx);
    return res.status(200).json({ success: true, data: instance });
  } catch (error) {
    return handleApiError(error, res);
  }
}
