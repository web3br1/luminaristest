import { z } from 'zod';
import { CURRENCIES, DEFAULT_CURRENCY } from '../constants';

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
  amount: z.number().positive().optional(),
  currency: z.enum(CURRENCIES).optional(),
  winProbability: z.number().min(0).max(100).optional(),
});

export const CreateProposalSchema = z.object({
  leadId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(CURRENCIES).default(DEFAULT_CURRENCY),
  winProbability: z.number().min(0).max(100).optional(),
  estimatedCloseDate: z.string().optional(),
});

export const RecordNoShowSchema = z
  .object({
    leadId: z.string().min(1),
    option: z.enum(['reschedule', 'revert']),
    rescheduleAt: z.string().datetime().optional(),
    previousStageId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.option === 'reschedule' && !val.rescheduleAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['rescheduleAt'],
        message: 'rescheduleAt é obrigatório quando option=reschedule',
      });
    }
    if (val.option === 'revert' && !val.previousStageId) {
      ctx.addIssue({
        code: 'custom',
        path: ['previousStageId'],
        message: 'previousStageId é obrigatório quando option=revert',
      });
    }
  });

export type AdvanceStageInput = z.infer<typeof AdvanceStageSchema>;
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;
export type RecordNoShowInput = z.infer<typeof RecordNoShowSchema>;
