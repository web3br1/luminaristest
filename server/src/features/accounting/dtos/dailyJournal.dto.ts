import { z } from 'zod';
import { isValidDateOnly } from '../models/dates';

/**
 * Zod DTO for the Livro Diário report (registro cronológico — the human-readable
 * contrapartida of the SPED ECD I200/I250 blocks, but generating NO file).
 *
 * Validation is shape-only at the boundary; the service trusts the parsed types.
 * `.strict()` rejects unknown keys. `from`/`to` are date-only (YYYY-MM-DD),
 * calendar-validated via `isValidDateOnly` (a bare regex silently rolls day overflow
 * forward — models/dates.ts). The `from <= to` ordering is enforced by superRefine.
 */

const dateOnly = z
  .string()
  .refine(isValidDateOnly, 'Data deve ser uma data real no formato YYYY-MM-DD');

/** GET/POST /accounting/reports/daily-journal query. */
export const DailyJournalRequestSchema = z
  .object({
    unitId: z.string().min(1),
    from: dateOnly,
    to: dateOnly,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'A data inicial (from) não pode ser posterior à data final (to).',
      });
    }
  });

export type DailyJournalRequestDto = z.infer<typeof DailyJournalRequestSchema>;
