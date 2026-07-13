import { z } from 'zod';

/**
 * Request params for GET receipt generation. Shape-only validation at the boundary:
 * unitId scopes the ledger, entryId identifies the lançamento. `.strict()` rejects
 * unknown keys.
 */
export const ReceiptRequestSchema = z
  .object({
    unitId: z.string().min(1),
    entryId: z.string().min(1),
  })
  .strict();

export type ReceiptRequestDto = z.infer<typeof ReceiptRequestSchema>;
