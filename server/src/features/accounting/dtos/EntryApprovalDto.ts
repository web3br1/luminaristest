import { z } from 'zod';
import { isValidDateOnly } from '../models/dates';
import { PostEntryLineSchema } from './PostingDto';

/**
 * EntryApprovalDto — maker-checker torre (ADR-INCR-APPROVAL). Command inputs for the
 * JournalEntry approval lifecycle (Draft → PendingApproval → Posted, reject → Draft). Every
 * mutation carries `expectedVersion` (the optimistic-lock value the actor last saw) so a stale
 * command fails the CAS instead of clobbering a concurrent transition (ACC-023). The top-level
 * command schemas are `.strict()` so a typo'd field fails loud (the reused PostEntryLineSchema
 * validates each leg). Money/dates follow the ledger rules (integer cents in the lines via
 * PostEntryLineSchema; date-only validated by isValidDateOnly).
 */

const dateOnly = (field: string) =>
  z.string().refine(isValidDateOnly, `${field} deve ser uma data real YYYY-MM-DD`);

const expectedVersion = z.number().int().min(1);

/** @openapi
 * components:
 *   schemas:
 *     CreateDraftEntryInput:
 *       type: object
 *       required: [unitId, date, description, lines]
 *       properties:
 *         unitId:      { type: string }
 *         date:        { type: string, description: "Date-only YYYY-MM-DD" }
 *         description: { type: string }
 *         lines:
 *           type: array
 *           minItems: 2
 *           items: { $ref: '#/components/schemas/PostEntryLine' }
 */
export const CreateDraftEntrySchema = z
  .object({
    unitId: z.string().min(1),
    date: dateOnly('date'),
    description: z.string().min(1),
    lines: z.array(PostEntryLineSchema).min(2),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     UpdateDraftEntryInput:
 *       type: object
 *       required: [unitId, expectedVersion, date, description, lines]
 *       properties:
 *         unitId:          { type: string }
 *         expectedVersion: { type: integer, minimum: 1 }
 *         date:            { type: string, description: "Date-only YYYY-MM-DD" }
 *         description:     { type: string }
 *         lines:
 *           type: array
 *           minItems: 2
 *           items: { $ref: '#/components/schemas/PostEntryLine' }
 */
export const UpdateDraftEntrySchema = z
  .object({
    unitId: z.string().min(1),
    expectedVersion,
    date: dateOnly('date'),
    description: z.string().min(1),
    lines: z.array(PostEntryLineSchema).min(2),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     SubmitEntryInput:
 *       type: object
 *       required: [unitId, expectedVersion]
 *       properties:
 *         unitId:          { type: string }
 *         expectedVersion: { type: integer, minimum: 1 }
 */
export const SubmitEntrySchema = z
  .object({ unitId: z.string().min(1), expectedVersion })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ApproveEntryInput:
 *       type: object
 *       required: [unitId, expectedVersion]
 *       properties:
 *         unitId:          { type: string }
 *         expectedVersion: { type: integer, minimum: 1 }
 */
export const ApproveEntrySchema = z
  .object({ unitId: z.string().min(1), expectedVersion })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     RejectEntryInput:
 *       type: object
 *       required: [unitId, expectedVersion]
 *       properties:
 *         unitId:          { type: string }
 *         expectedVersion: { type: integer, minimum: 1 }
 *         reason:          { type: string }
 */
export const RejectEntrySchema = z
  .object({ unitId: z.string().min(1), expectedVersion, reason: z.string().min(1).optional() })
  .strict();

/** Query DTO for the pending-approval queue — unitId required, paginated. */
export const ListPendingApprovalQuerySchema = z.object({
  unitId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateDraftEntryInput = z.infer<typeof CreateDraftEntrySchema>;
export type UpdateDraftEntryInput = z.infer<typeof UpdateDraftEntrySchema>;
export type SubmitEntryInput = z.infer<typeof SubmitEntrySchema>;
export type ApproveEntryInput = z.infer<typeof ApproveEntrySchema>;
export type RejectEntryInput = z.infer<typeof RejectEntrySchema>;
export type ListPendingApprovalQueryInput = z.infer<typeof ListPendingApprovalQuerySchema>;
