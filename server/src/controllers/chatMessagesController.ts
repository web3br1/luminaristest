import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { CreateChatMessageSchema, ListChatMessagesQuerySchema } from '@/features/chatMessages/dtos/ChatMessageDto';

export async function listMessages(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parsed = ListChatMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const { instanceId, page, pageSize } = parsed.data;

    const svc = getFactory().getChatMessageService();

    // Additive pagination: when page/pageSize are provided, return a page + meta; otherwise the full thread.
    const paginate = req.query.page !== undefined || req.query.pageSize !== undefined;
    const { messages, total } = await svc.getMessagesByInstance(
      instanceId,
      ctx,
      paginate ? { skip: (page - 1) * pageSize, take: pageSize } : undefined,
    );

    if (paginate) {
      return res.status(200).json({ success: true, data: messages, total, page, pageSize });
    }
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
    if (!body.success) return res.status(400).json({ success: false, error: body.error.flatten() });

    const svc = getFactory().getChatMessageService();
    const newMessage = await svc.createMessage(body.data, ctx);
    return res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    return handleApiError(error, res);
  }
}
