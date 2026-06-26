import { ValidationError } from '../../../../lib/errors';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';

/**
 * Maps `salon.sale.returned` → contra-revenue entry (Incremento D / devolução):
 *   Débito  3.2   (Devoluções de Vendas) = amountCents
 *   Crédito 1.1.2 (A Receber)            = amountCents
 *
 * This is NOT a reversal of the finalized revenue entry (D2-Q5: distinct effect). The
 * original `salon.sale.finalized` entry (D 1.1.2 / C 3.1) stays Posted; the return books a
 * SEPARATE entry that debits the 3.2 contra-revenue leaf — so net revenue
 * (Σ crédito − débito over Revenue accounts) is reduced by the return, and A Receber is
 * cleared symmetrically. A cancellation, by contrast, reverses the finalized entry outright.
 */
export class SalonSaleReturnedMapper implements IAccountingEventMapper {
  public readonly sourceType = 'salon.sale.returned' as const;

  /** Leaf account codes (canonical chart). */
  private static readonly DEBIT_ACCOUNT = '3.2'; //  Devoluções de Vendas (contra-revenue)
  private static readonly CREDIT_ACCOUNT = '1.1.2'; // A Receber

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1 / AC-2.2-1) — identical to SalonSaleFinalizedMapper. The
    // salon `totalAmount` is a JSON float in reais; accounting stores integer cents. Convert
    // here, exactly once, with hard guards — the single point where float imprecision could
    // re-enter the exact-integer money path.
    // ponytail: Math.round(reais*100) is the ceiling; if sales ever store cents natively,
    // drop the *100 and the round.
    const amount = event.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new ValidationError(
        `Valor inválido para lançamento de devolução (venda '${event.sourceId}'): não é um número finito.`,
      );
    }
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents)) {
      throw new ValidationError(
        `Valor fora da faixa segura de centavos (devolução da venda '${event.sourceId}').`,
      );
    }
    if (amountCents <= 0) {
      throw new ValidationError(
        `Valor deve ser maior que zero para registrar devolução (venda '${event.sourceId}').`,
      );
    }

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `Devolução salão — Venda ${event.sourceId}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: SalonSaleReturnedMapper.DEBIT_ACCOUNT, debitCents: amountCents, creditCents: 0 },
        { accountCode: SalonSaleReturnedMapper.CREDIT_ACCOUNT, debitCents: 0, creditCents: amountCents },
      ],
    };
  }
}
