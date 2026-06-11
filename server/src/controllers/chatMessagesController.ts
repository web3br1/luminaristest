import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { CreateChatMessageSchema } from '@/features/chatMessages/dtos/ChatMessageDto';

const QueryParamsSchema = z.object({
  page: z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform(v => (v ? parseInt(v, 10) : 10)),
  instanceId: z.string().cuid({ message: 'Invalid instance ID format' }),
});

export async function listMessages(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { instanceId } = QueryParamsSchema.parse({ ...req.query, instanceId: req.query.instanceId });
    const svc = getFactory().getChatMessageService();
    const messages = await svc.getMessagesByInstance(instanceId, ctx as any);
    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    return handleApiError(error, res);
  }
}

export async function createMessage(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const body = CreateChatMessageSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, error: body.error.format() });

    const svc = getFactory().getChatMessageService();
    const newMessage = await svc.createMessage(body.data, ctx as any);
    return res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    return handleApiError(error, res);
  }
}
