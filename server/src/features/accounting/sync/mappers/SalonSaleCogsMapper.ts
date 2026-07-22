import { ValidationError } from '../../../../lib/errors';
import { MAX_CENTS } from '../../models/money';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';

/**
 * Maps `salon.sale.cogs` → cost-of-goods entry (INCR-INVENTORY, Body 2 / O-2):
 *   Débito  4.2   (Custo das Mercadorias Vendidas / Expense) = costCents
 *   Crédito 1.1.6 (Estoques / Asset)                          = costCents
 *
 * The razão (ledger) leg of a sale's CMV. It mirrors `SalonSaleFinalizedMapper`, with ONE
 * deliberate difference at the money boundary: the value arrives ALREADY IN INTEGER CENTS
 * (`event.costCents`), computed by `InventoryService.recordSaleCogs` from the moving-average
 * subledger (D5/D6). There is NO float→cents conversion here — the cents are exact by
 * construction and merely re-validated against the persistence ceiling. `event.amount`
 * (the raw float carried for revenue-style events) is IGNORED for this event kind; the mapper
 * that needs a field validates it (mirror of `paymentMethod`/`revenueByNature`).
 *
 * The subledger baixa (tx1, InventoryService) and this post (tx2, PostingService) are DIFFERENT
 * commits — the razão is idempotent on @@unique([userId,unitId,sourceType,sourceId]) with
 * sourceType='salon.sale.cogs', so a reconcile re-drive posts at most once (never colliding with
 * the revenue entry, which is sourceType='salon.sale.finalized' for the same saleId).
 */
export class SalonSaleCogsMapper implements IAccountingEventMapper {
  public readonly sourceType = 'salon.sale.cogs' as const;

  /** Leaf account codes (canonical chart — ChartOfAccountsFixture, Fase 0). */
  private static readonly DEBIT_ACCOUNT = '4.2'; // Custo das Mercadorias Vendidas (Expense)
  private static readonly CREDIT_ACCOUNT = '1.1.6'; // Estoques (Asset)

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1). Unlike the revenue mapper, the value is ALREADY integer
    // cents (InventoryService computed it in the exact-integer money path). Guard it as an Int in
    // the safe persistence range — never reconvert from a float.
    const costCents = event.costCents;
    if (typeof costCents !== 'number' || !Number.isSafeInteger(costCents)) {
      throw new ValidationError(
        `Custo inválido para lançamento de CMV (venda '${event.sourceId}'): não é um inteiro seguro.`,
      );
    }
    if (costCents <= 0) {
      throw new ValidationError(
        `Custo deve ser maior que zero para lançar CMV (venda '${event.sourceId}').`,
      );
    }
    if (costCents > MAX_CENTS) {
      throw new ValidationError(
        `Custo fora da faixa suportada de centavos (venda '${event.sourceId}').`,
      );
    }

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `CMV salão — Venda ${event.sourceId}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: SalonSaleCogsMapper.DEBIT_ACCOUNT, debitCents: costCents, creditCents: 0 },
        { accountCode: SalonSaleCogsMapper.CREDIT_ACCOUNT, debitCents: 0, creditCents: costCents },
      ],
    };
  }
}
