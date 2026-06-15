import type { RuleContext } from '../../RuleTypes';
import { resolveTable } from '../../shared/tableFinder';

/** Find the commissions table in the workspace (indexed-first). */
async function findCommissionsTable(ctx: RuleContext): Promise<string | null> {
  const t = await resolveTable(ctx, {
    internalName: 'commissions',
    category: 'finance',
    names: ['Commissions', 'Comissões'],
  });
  return t?.id || null;
}

/**
 * When a sale is Finalized, create one commission record per sale item that has
 * a responsibleEmployeeId and commission > 0.
 *
 * Idempotent: skips items that already have a commission record for the same saleItemId.
 */
export async function materializeCommissions(
  ctx: RuleContext,
  items: Array<{ id: string; data: Record<string, unknown> }>,
  prevStatus: string,
  nextStatus: string
): Promise<void> {
  // Only fires on the Finalized transition, not on re-finalizations
  if (prevStatus === 'Finalized' || nextStatus !== 'Finalized') return;

  const commissionsTableId = await findCommissionsTable(ctx);
  if (!commissionsTableId) return; // commissions feature not installed

  const saleId = String((ctx.after as any)?.id || (ctx.before as any)?.id || '');
  // Existing commissions for THIS sale only (indexed) — idempotency is per saleItemId within the sale.
  const existing = await ctx.repository.findRowsByFieldValue(commissionsTableId, 'saleId', saleId);

  for (const it of items) {
    const employeeId = String(it.data?.responsibleEmployeeId || '').trim();
    const commissionAmount = Number(it.data?.commission ?? 0);
    if (!employeeId || !(commissionAmount > 0)) continue;

    // Idempotency: skip if a commission for this saleItemId already exists
    const alreadyExists = existing.some(
      (r: any) => String((r.data as any)?.saleItemId || '') === String(it.id)
    );
    if (alreadyExists) continue;

    const unitPrice = Number(it.data?.unitPrice ?? 0);
    const commissionRate = unitPrice > 0 ? (commissionAmount / unitPrice) * 100 : 0;

    const payload: Record<string, unknown> = {
      employeeId,
      saleId,
      saleItemId: it.id,
      amount: commissionAmount,
      commissionRate: Math.round(commissionRate * 100) / 100,
      status: 'Pending',
    };

    await ctx.repository.createData(commissionsTableId, payload);
  }
}

/**
 * When a sale is Cancelled or Returned (from Finalized), cancel the commission
 * records that are not yet Paid (i.e. Pending).
 * Paid commissions are protected by CommissionsModule immutableAfter rules and
 * must be resolved manually.
 */
export async function cancelCommissionsForSale(
  ctx: RuleContext,
  prevStatus: string,
  nextStatus: string
): Promise<void> {
  // Only fires when leaving Finalized
  if (prevStatus !== 'Finalized') return;
  if (nextStatus !== 'Cancelled' && nextStatus !== 'Returned') return;

  const commissionsTableId = await findCommissionsTable(ctx);
  if (!commissionsTableId) return;

  const saleId = String((ctx.after as any)?.id || (ctx.before as any)?.id || '');
  const rows = await ctx.repository.findRowsByFieldValue(commissionsTableId, 'saleId', saleId);

  for (const row of rows) {
    const d = (row.data as any) || {};
    const status = String(d.status || 'Pending');
    // Paid commissions are immutable — skip them
    if (status === 'Paid') continue;
    // Cancel the commission by updating status to reflect sale reversal
    await ctx.repository.updateData(String(row.id), { ...d, status: 'Cancelled' });
  }
}
