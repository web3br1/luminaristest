import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { CreateChatInstanceSchema, UpdateChatInstanceSchema, mapToDto } from '@/features/chatInstances/dtos/ChatInstanceDto';

const QueryParamsSchema = z.object({
  page: z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform(v => (v ? parseInt(v, 10) : 10)),
  type: z.enum(['DOCUMENT', 'GENERIC']).optional(),
});

export async function listChatInstances(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { page, limit, type } = QueryParamsSchema.parse(req.query);
    const svc = getFactory().getChatInstanceService();

    if (type) {
      const instances = await svc.getInstancesByUser(ctx as any, type);
      return res.status(200).json({ success: true, data: instances, totalCount: instances.length });
    }

    const { instances, totalCount } = await svc.getAllInstances(ctx as any, page, limit);
    return res.status(200).json({ success: true, data: instances, totalCount });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const bodyResult = CreateChatInstanceSchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ success: false, error: bodyResult.error.format() });

    const svc = getFactory().getChatInstanceService();
    const newInstance = await svc.createInstance(bodyResult.data, ctx as any);
    return res.status(201).json({ success: true, data: mapToDto(newInstance) });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function updateChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Instance ID required' });

    const bodyResult = UpdateChatInstanceSchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ success: false, error: bodyResult.error.format() });

    const svc = getFactory().getChatInstanceService();
    const updatedInstance = await svc.updateInstance(id, bodyResult.data, ctx as any);
    return res.status(200).json({ success: true, data: mapToDto(updatedInstance) });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function deleteChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Instance ID required' });

    const svc = getFactory().getChatInstanceService();
    await svc.deleteInstance(id, ctx as any);
    return res.status(200).json({ success: true, message: 'Chat instance deleted' });
  } catch (error) {
    return handleApiError(error, res);
  }
}

const GetOrCreateSchema = z.object({
  widgetInstanceId: z.string().min(1),
  type: z.enum(['DOCUMENT', 'GENERIC']),
});

export async function getOrCreateChatInstance(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const bodyResult = GetOrCreateSchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ success: false, error: bodyResult.error.format() });

    const { widgetInstanceId, type } = bodyResult.data;
    const svc = getFactory().getChatInstanceService();
    const instance = await svc.getOrCreateInstance(widgetInstanceId, type, ctx as any);
    return res.status(200).json({ success: true, data: instance });
  } catch (error) {
    return handleApiError(error, res);
  }
}
