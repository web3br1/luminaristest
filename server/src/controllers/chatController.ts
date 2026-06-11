import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { ChatRequestSchema } from '@/features/chat/dtos/ChatDto';

export async function postChat(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

    const parse = ChatRequestSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() });

    const chatService = getFactory().getChatService();
    const response = await chatService.generateResponse({ ...parse.data, user: ctx as any });
    return res.json(response);
  } catch (error) {
    return handleApiError(error, res);
  }
}
