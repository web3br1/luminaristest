import { ValidationError } from '../../../../lib/errors';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';

/**
 * Maps `salon.sale.settled` → the receivable-settlement entry (Incremento D / D1):
 *   Débito  <conta por paymentMethod>  = amountCents   (where the money landed)
 *   Crédito 1.1.2 (A Receber)          = amountCents   (clear the receivable)
 *
 * The settlement is a SEPARATE entry from the revenue recognition (D 1.1.2 / C 3.1, sourceType
 * 'salon.sale.finalized'): revenue books A Receber when the sale is Finalized; settlement clears
 * it when the sale is Paid. Distinct sourceType ('salon.sale.settled') ⇒ the two coexist for the
 * same saleId without colliding on @@unique([userId,unitId,sourceType,sourceId]).
 *
 * Chart mapping (D1-QMAP, ratified in D0) — debit by paymentMethod:
 *   Cash            → 1.1.3 (Caixa)
 *   Pix             → 1.1.1 (Banco)
 *   Debit Card      → 1.1.4 (A Receber Cartão / Adquirente)  ← gross, not net (D1-Q5/Q6)
 *   Credit Card     → 1.1.4 (A Receber Cartão / Adquirente)  ← acquirer fee is Incremento F
 *   Package Balance → 2.1.1 (Pacotes Pré-pagos, Liability)   ← NEVER cash (D1-Q10)
 */
export class SalonSaleSettledMapper implements IAccountingEventMapper {
  public readonly sourceType = 'salon.sale.settled' as const;

  /** A settlement always credits the receivable leaf — symmetric to the revenue debit. */
  private static readonly CREDIT_ACCOUNT = '1.1.2'; // A Receber

  /** Package Balance debits the prepaid liability (advance consumed), never an asset/cash leaf. */
  private static readonly PREPAID_LIABILITY_ACCOUNT = '2.1.1'; // Pacotes Pré-pagos

  /**
   * paymentMethod → debit account. The values mirror SelectPresets.paymentMethod EXACTLY; an
   * unknown/missing method is rejected (no silent default to cash). Card → gross to 1.1.4.
   */
  private static readonly DEBIT_ACCOUNT_BY_METHOD: Readonly<Record<string, string>> = {
    Cash: '1.1.3', // Caixa
    Pix: '1.1.1', // Banco
    'Debit Card': '1.1.4', // A Receber Cartão / Adquirente
    'Credit Card': '1.1.4', // A Receber Cartão / Adquirente
    'Package Balance': SalonSaleSettledMapper.PREPAID_LIABILITY_ACCOUNT,
  };

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1 / AC-2.2-1) — identical to SalonSaleFinalizedMapper. The salon
    // `totalAmount` is a JSON float in reais; accounting stores integer cents. Convert here, exactly
    // once, with hard guards — the single point where float imprecision could re-enter the
    // exact-integer money path.
    // ponytail: Math.round(reais*100) is the ceiling; if sales ever store cents natively, drop the
    // *100 and the round.
    const amount = event.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new ValidationError(
        `Valor inválido para liquidação (venda '${event.sourceId}'): não é um número finito.`,
      );
    }
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents)) {
      throw new ValidationError(
        `Valor fora da faixa segura de centavos (liquidação da venda '${event.sourceId}').`,
      );
    }
    if (amountCents <= 0) {
      throw new ValidationError(
        `Valor deve ser maior que zero para liquidar a venda '${event.sourceId}'.`,
      );
    }

    // CHART MAPPING — resolve the debit account from the paymentMethod. Never default silently:
    // a missing/unknown method is a wiring error, and Package Balance must NEVER fall back to cash.
    const method = event.paymentMethod;
    if (typeof method !== 'string' || method.length === 0) {
      throw new ValidationError(
        `Liquidação sem forma de pagamento (venda '${event.sourceId}') — não é possível escolher a conta de débito.`,
      );
    }
    const debitAccount = SalonSaleSettledMapper.DEBIT_ACCOUNT_BY_METHOD[method];
    if (!debitAccount) {
      throw new ValidationError(
        `Forma de pagamento '${method}' não mapeada para conta de débito (venda '${event.sourceId}').`,
      );
    }
    // Defensive (D1-Q10): Package Balance must resolve to the prepaid liability, never anything
    // else. If the constant is ever cleared, fail loudly instead of mis-booking to cash.
    if (method === 'Package Balance' && debitAccount !== SalonSaleSettledMapper.PREPAID_LIABILITY_ACCOUNT) {
      throw new ValidationError(
        `blocked_missing_prepaid_liability_account: liquidação de Package Balance exige a conta de passivo de adiantamento (venda '${event.sourceId}').`,
      );
    }

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `Liquidação salão — Venda ${event.sourceId}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: debitAccount, debitCents: amountCents, creditCents: 0 },
        { accountCode: SalonSaleSettledMapper.CREDIT_ACCOUNT, debitCents: 0, creditCents: amountCents },
      ],
    };
  }
}
