import type { RuleContext } from '../../RuleTypes';

/** Stable internal names for the Sales subsystem tables. */
export const SALE_KEYS = {
  SALES: 'sales',
  ITEMS: 'saleItems',
};

/** Resolve a Sale row by id (global PK lookup; ids are workspace-unique CUIDs). */
export async function findSaleById(ctx: RuleContext, saleId: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const row = await ctx.repository.findDataById(String(saleId));
  return row ? { id: row.id, data: (row.data as Record<string, unknown>) ?? {} } : null;
}
