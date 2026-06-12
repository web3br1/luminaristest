import type { Request, Response } from 'express';
import { z } from 'zod';
import { handleApiError } from '@/lib/apiUtils';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { InterviewService } from '@/features/interview/InterviewService/InterviewService';
import { InterviewStage, IMessage } from '@/features/interview/models/InterviewTypes';

/**
 * Schema for the incoming ChatInterview request body.
 * The frontend (useAiInterview.ts) sends: { messages, stage, presetKey?, sessionId? }
 * Note: messages use { sender, text } on the frontend; we map them to { role, content } here.
 */
const MessageSchema = z.object({
  // Frontend uses `sender` / `text`; accept both shapes for robustness
  role: z.enum(['user', 'assistant']).optional(),
  sender: z.enum(['user', 'ai']).optional(),
  content: z.string().optional(),
  text: z.string().optional(),
});

const ChatInterviewSchema = z.object({
  stage: z.string().optional().default('GREETING'),
  messages: z.array(MessageSchema).optional().default([]),
  presetKey: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * Normalises the mixed frontend/backend message shape into the IMessage format
 * expected by InterviewService.
 */
function normaliseMessages(raw: z.infer<typeof MessageSchema>[]): IMessage[] {
  return raw
    .map((m): IMessage | null => {
      // Determine role
      let role: 'user' | 'assistant';
      if (m.role) {
        role = m.role;
      } else if (m.sender === 'user') {
        role = 'user';
      } else if (m.sender === 'ai') {
        role = 'assistant';
      } else {
        return null; // unknown shape — skip
      }

      const content = m.content ?? m.text ?? '';
      return { role, content };
    })
    .filter((m): m is IMessage => m !== null);
}

/**
 * POST /api/dashboard/ai/ChatInterview
 *
 * Drives the AI onboarding interview. Authentication is required (auth middleware
 * must have set x-user-id etc. in the request headers upstream).
 *
 * Request body:
 *   { stage?: InterviewStage, messages?: IMessage[], presetKey?: string, sessionId?: string }
 *
 * Response:
 *   { response: string, nextStage: InterviewStage, presetKey?: string,
 *     sessionId?: string, startCustomization?: boolean, customizationState?: object }
 */
export async function postChatInterview(req: Request, res: Response) {
  try {
    const ctx = getUserContextFromRequest(req);
    if (!ctx) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const parse = ChatInterviewSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ success: false, error: parse.error.flatten() });
    }

    const { stage, messages: rawMessages, presetKey, sessionId } = parse.data;

    // Validate that the stage is a known InterviewStage (fall back to GREETING if unknown)
    const validStages: InterviewStage[] = [
      'GREETING',
      'DISCOVERING_BUSINESS',
      'CONFIRMING_BUSINESS',
      'MATCHING_PRESET',
      'AWAITING_CREATION_TYPE_CONFIRMATION',
      'CUSTOMIZATION_INTRO',
      'CUSTOMIZATION_IN_PROGRESS',
      'CUSTOMIZATION_COMPLETED',
      'IDENTIFYING_ENTITIES',
      'CANNOT_PROCEED',
      'COMPLETED',
    ];
    const currentStage: InterviewStage = validStages.includes(stage as InterviewStage)
      ? (stage as InterviewStage)
      : 'GREETING';

    const messages = normaliseMessages(rawMessages);

    const interviewService = InterviewService.getInstance();
    const result = await interviewService.processTurn(
      currentStage,
      messages,
      presetKey,
      sessionId
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleApiError(error, res);
  }
}
