import { z } from 'zod';

/** @openapi
 * components:
 *   schemas:
 *     CrmAnalyticsQuery:
 *       type: object
 *       properties:
 *         datePreset: { type: string, enum: [today, thisWeek, thisMonth, last30Days, lastMonth, thisYear] }
 */
export const CrmAnalyticsQuerySchema = z.object({
  datePreset: z
    .enum(['today', 'thisWeek', 'thisMonth', 'last30Days', 'lastMonth', 'thisYear'])
    .default('thisYear'),
  timeZone: z.string().optional(),
});

export type CrmAnalyticsInput = z.infer<typeof CrmAnalyticsQuerySchema>;
