import { z } from 'zod';

/** @openapi
 * components:
 *   schemas:
 *     AdvanceStageInput:
 *       type: object
 *       required: [leadId, stageId]
 *       properties:
 *         leadId:    { type: string }
 *         stageId:   { type: string }
 *         stageType: { type: string, description: "init|meeting|proposal|negotiation|closed_won|closed_lost" }
 *         meetingAt: { type: string, format: date-time }
 *         amount:    { type: number }
 *         currency:  { type: string, enum: [BRL, USD, EUR] }
 *         winProbability: { type: number }
 */
export const AdvanceStageSchema = z.object({
  leadId: z.string().min(1),
  stageId: z.string().min(1),
  stageType: z.string().optional(),
  meetingAt: z.string().datetime().optional(),
  amount: z.number().min(0).optional(),
  currency: z.enum(['BRL', 'USD', 'EUR']).optional(),
  winProbability: z.number().min(0).max(100).optional(),
});

export const CreateProposalSchema = z.object({
  leadId: z.string().min(1),
  amount: z.number().min(0),
  currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  winProbability: z.number().min(0).max(100).optional(),
  estimatedCloseDate: z.string().optional(),
});

export const RecordNoShowSchema = z.object({
  leadId: z.string().min(1),
  option: z.enum(['reschedule', 'revert']),
  rescheduleAt: z.string().datetime().optional(),
  previousStageId: z.string().optional(),
});

export type AdvanceStageInput = z.infer<typeof AdvanceStageSchema>;
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;
export type RecordNoShowInput = z.infer<typeof RecordNoShowSchema>;
