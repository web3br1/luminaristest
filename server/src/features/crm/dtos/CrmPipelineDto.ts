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

/** @openapi
 * components:
 *   schemas:
 *     ConvertLeadInput:
 *       type: object
 *       required: [leadId, account]
 *       properties:
 *         leadId: { type: string }
 *         account:
 *           type: object
 *           required: [name]
 *           properties:
 *             name:    { type: string }
 *             segment: { type: string }
 *             size:    { type: string }
 *             website: { type: string }
 *             taxId:   { type: string }
 *             city:    { type: string }
 *             state:   { type: string }
 *         contact:
 *           type: object
 *           properties:
 *             name:     { type: string }
 *             email:    { type: string }
 *             phone:    { type: string }
 *             jobTitle: { type: string }
 *             role:     { type: string }
 */
export const ConvertLeadSchema = z.object({
  leadId: z.string().min(1),
  account: z.object({
    name: z.string().min(1),
    segment: z.string().optional(),
    size: z.enum(['Micro', 'Small', 'Medium', 'Large', 'Enterprise']).optional(),
    website: z.string().optional(),
    taxId: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
  contact: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      jobTitle: z.string().optional(),
      role: z.enum(['Decision Maker', 'Influencer', 'Champion', 'Gatekeeper', 'User']).optional(),
    })
    .optional(),
});

export type AdvanceStageInput = z.infer<typeof AdvanceStageSchema>;
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;
export type RecordNoShowInput = z.infer<typeof RecordNoShowSchema>;
export type ConvertLeadInput = z.infer<typeof ConvertLeadSchema>;

/** Type guard for AdvanceStageInput. */
export function isAdvanceStageInput(obj: unknown): obj is AdvanceStageInput {
  return AdvanceStageSchema.safeParse(obj).success;
}

/** Type guard for CreateProposalInput. */
export function isCreateProposalInput(obj: unknown): obj is CreateProposalInput {
  return CreateProposalSchema.safeParse(obj).success;
}

/** Type guard for RecordNoShowInput. */
export function isRecordNoShowInput(obj: unknown): obj is RecordNoShowInput {
  return RecordNoShowSchema.safeParse(obj).success;
}

/** Type guard for ConvertLeadInput. */
export function isConvertLeadInput(obj: unknown): obj is ConvertLeadInput {
  return ConvertLeadSchema.safeParse(obj).success;
}
