import type { RuleContext } from '../../RuleTypes';
import type { IDynamicTableData } from '../../../models/DynamicTable.model';
import { ValidationError } from '../../../../../lib/errors';
import { logger } from '../../../../../lib/logger';
import { SALE_KEYS, findSaleById } from './shared';

/**
 * If the first item creation fails, delete the just-created sale to avoid orphan drafts.
 */
export async function deleteSaleIfFirstItem(ctx: RuleContext, saleId: string) {
  if (!saleId) return;
  try {
    const existing = await ctx.repository.findRowsByFieldValue(ctx.table.id, 'saleId', saleId);
    if (existing.length === 0) {
      await ctx.repository.deleteData(saleId);
    }
  } catch (err) {
    // Cleanup path: log but do not propagate, to avoid masking the original failure.
    logger.warn('SalesPlugin.deleteSaleIfFirstItem cleanup failed', { saleId, err: String(err) });
  }
}

/**
 * Load all items for the current sale operation and resolve sale unitId when present.
 */
export async function loadSaleItems(ctx: RuleContext): Promise<{ items: Array<{ id: string; data: Record<string, unknown> }>; saleUnitId?: string }> {
  const saleTableId = (ctx.table.id);
  const saleUnitIdField = ((ctx.schema.fields || []).find((f: { name: string }) => f.name === 'unitId')) ? 'unitId' : undefined;
  const saleUnitId = saleUnitIdField ? String(ctx.after?.unitId || ctx.before?.unitId || '') : undefined;

  let saleItemsTableId: string | null = null;

  // Fast path: preset sale-items table resolves via indexed internalName lookup.
  const presetItems = await ctx.repository.findTableByInternalName(ctx.userId, SALE_KEYS.ITEMS);
  if (presetItems) {
    saleItemsTableId = presetItems.id;
  }

  // Fallback (custom tables without internalName): heuristic over all tables.
  const tables = saleItemsTableId ? [] : await ctx.repository.findTablesByUserId(ctx.userId);

  // Primeiro, procura por uma tabela com nome exato "Sale Items" ou similar
  // que tenha um campo saleId do tipo relation
  const saleItemsNamePatterns = ['Sale Items', 'Itens da Venda', 'SaleItems', 'saleItems'];

  for (const t of tables) {
    const fields = (t.schema?.fields || []);
    const saleIdField = fields.find((f) => f.name === 'saleId' && f.type === 'relation');
    if (!saleIdField) continue;

    const nameLower = t.name.toLowerCase();
    // Verificação por internalName (prioritária) ou padrões de nome
    const isSaleItemsTable = t.internalName === SALE_KEYS.ITEMS ||
      saleItemsNamePatterns.some(p => p.toLowerCase() === nameLower) ||
      nameLower.includes('sale item') ||
      nameLower.includes('itens da venda');

    // Exclui tabelas que não são itens de venda (como Commissions)
    const isExcluded = nameLower === 'commissions' ||
      nameLower === 'comissões' ||
      nameLower.includes('commission');

    if (isSaleItemsTable && !isExcluded) {
      saleItemsTableId = t.id;
      break;
    }
  }

  // Fallback: se não encontrou por nome, procura por relação exata com a tabela de vendas
  if (!saleItemsTableId) {
    for (const t of tables) {
      const fields = (t.schema?.fields || []);
      const saleIdField = fields.find((f) => f.name === 'saleId' && f.type === 'relation');
      if (!saleIdField) continue;

      // Exclui tabelas conhecidas que não são itens de venda
      const nameLower = t.name.toLowerCase();
      const isExcluded = nameLower === 'commissions' ||
        nameLower === 'comissões' ||
        nameLower.includes('commission');
      if (isExcluded) continue;

      const targetTable = saleIdField.relation?.targetTable || '';
      // Match by exact ID or preset placeholder
      if (targetTable === saleTableId || String(targetTable).startsWith('@@PRESET_TABLE_KEY::sales')) {
        saleItemsTableId = t.id;
        break;
      }
    }
  }

  if (!saleItemsTableId) {
    return { items: [], saleUnitId };
  }

  const saleId = String(ctx.after?.id || ctx.before?.id || '');
  const rawItems = await ctx.repository.findRowsByFieldValue(saleItemsTableId, 'saleId', saleId);
  const items = rawItems.map((row: IDynamicTableData) => ({ id: row.id, data: (row.data as Record<string, unknown>) ?? {} }));

  return { items, saleUnitId };
}

/**
 * Enforce that a sale item references exactly one of productId or serviceId, and product qty > 0.
 */
export async function validateSaleItemXor(_ctx: RuleContext, after: Record<string, unknown>) {
  // Applies to mixed variant: exactly one of productId or serviceId must be provided
  const hasProduct = !!after?.productId;
  const hasService = !!after?.serviceId;
  if ((hasProduct && hasService) || (!hasProduct && !hasService)) {
    throw new ValidationError('Item de venda inválido: informe exatamente um entre productId ou serviceId.');
  }
  // Quantity validation for products
  if (hasProduct) {
    const qty = Number(after?.quantity || 0);
    if (!(qty > 0)) {
      throw new ValidationError('Quantidade do produto deve ser maior que zero.');
    }
  }
}

/**
 * Prevent mixing product and service items within the same sale.
 * Called on insert of a new sale item.
 */
export async function validateNoMixedItemTypesOnInsert(ctx: RuleContext, after: Record<string, unknown>) {
  const saleId = String(after?.saleId || '');
  if (!saleId) return;
  // Fetch existing items for this sale via indexed query (current table = sale items).
  const allItems = await ctx.repository.findRowsByFieldValue(ctx.table.id, 'saleId', saleId);
  const existing = allItems.map((r: IDynamicTableData) => (r.data as Record<string, unknown>) || {});
  const types = new Set<string>();
  for (const it of existing) {
    if (it?.productId || String(it?.type || '') === 'Product') types.add('Product');
    if (it?.serviceId || String(it?.type || '') === 'Service') types.add('Service');
  }
  // Include the new one
  if (after?.productId || String(after?.type || '') === 'Product') types.add('Product');
  if (after?.serviceId || String(after?.type || '') === 'Service') types.add('Service');
  if (types.has('Product') && types.has('Service') && !ctx.isSystem) {
    throw new ValidationError('Venda não pode mesclar produtos e serviços; crie vendas separadas.');
  }
}

/** Prevent item mutations when the parent sale has been finalized. */
export async function assertParentSaleNotFinalized(ctx: RuleContext) {
  const saleId = String(ctx.after?.saleId || ctx.before?.saleId || '');
  if (!saleId) return;
  const sale = await findSaleById(ctx, saleId);
  const status = String((sale?.data as Record<string, unknown>)?.status || 'Draft');
  if (status === 'Finalized') {
    throw new ValidationError('Não é permitido alterar itens de uma venda finalizada.');
  }
}
