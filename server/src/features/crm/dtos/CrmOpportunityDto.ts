import { z } from 'zod';
import { CURRENCIES, DEFAULT_CURRENCY } from '../constants';

const OPPORTUNITY_STATUS = ['Open', 'Won', 'Lost'] as const;

/** @openapi
 * components:
 *   schemas:
 *     AdvanceOpportunityInput:
 *       type: object
 *       required: [opportunityId, stageId]
 *       properties:
 *         opportunityId:  { type: string }
 *         stageId:        { type: string }
 *         stageType:      { type: string, description: "init|meeting|proposal|negotiation|closed_won|closed_lost" }
 *         amount:         { type: number }
 *         currency:       { type: string, enum: [BRL, USD, EUR] }
 *         winProbability: { type: number }
 *         status:         { type: string, enum: [Open, Won, Lost] }
 */
export const AdvanceOpportunitySchema = z.object({
  opportunityId: z.string().min(1),
  stageId: z.string().min(1),
  stageType: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(CURRENCIES).optional(),
  winProbability: z.number().min(0).max(100).optional(),
  status: z.enum(OPPORTUNITY_STATUS).optional(),
});

/** @openapi
 * components:
 *   schemas:
 *     ConvertLeadToOpportunityInput:
 *       type: object
 *       required: [leadId, name, pipelineId]
 *       properties:
 *         leadId:     { type: string }
 *         name:       { type: string }
 *         pipelineId: { type: string }
 *         stageId:    { type: string }
 *         amount:     { type: number }
 *         currency:   { type: string, enum: [BRL, USD, EUR] }
 *         accountId:  { type: string }
 */
export const ConvertLeadToOpportunitySchema = z.object({
  leadId: z.string().min(1),
  name: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(CURRENCIES).default(DEFAULT_CURRENCY),
  accountId: z.string().min(1).optional(),
});

export type AdvanceOpportunityInput = z.infer<typeof AdvanceOpportunitySchema>;
export type ConvertLeadToOpportunityInput = z.infer<typeof ConvertLeadToOpportunitySchema>;

/** Type guard for AdvanceOpportunityInput. */
export function isAdvanceOpportunityInput(obj: unknown): obj is AdvanceOpportunityInput {
  return AdvanceOpportunitySchema.safeParse(obj).success;
}

/** Type guard for ConvertLeadToOpportunityInput. */
export function isConvertLeadToOpportunityInput(obj: unknown): obj is ConvertLeadToOpportunityInput {
  return ConvertLeadToOpportunitySchema.safeParse(obj).success;
}
