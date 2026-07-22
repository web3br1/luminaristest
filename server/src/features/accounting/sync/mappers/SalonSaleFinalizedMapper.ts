import { ValidationError } from '../../../../lib/errors';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';
import { splitRevenueCredit } from './revenueSplit';

/**
 * Maps `salon.sale.finalized` → revenue recognition entry (Incremento C):
 *   Débito  1.1.2 (A Receber)             = amountCents
 *   Crédito 3.1   (Receita de Serviços)   = serviceCents
 *   Crédito 3.3   (Receita de Revenda)    = productCents   (ADR-INCR-REVENUE-SPLIT)
 * All are canonical leaf accounts (acceptsEntries=true) in ChartOfAccountsFixture. The
 * receivable (debit) is the full total regardless of nature; the credit is SPLIT by nature
 * so the ECF-Presumido Bloco P can read per-activity revenue by account.
 * paymentStatus is ignored here: even a `Paid` sale posts to A Receber; the settlement
 * (A Receber → Caixa/Banco) is a separate Incremento D.
 */
export class SalonSaleFinalizedMapper implements IAccountingEventMapper {
  public readonly sourceType = 'salon.sale.finalized' as const;

  /** Leaf account code (canonical chart). Credit codes live in revenueSplit.ts. */
  private static readonly DEBIT_ACCOUNT = '1.1.2'; // A Receber

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1 / AC-2.2-1). The salon `totalAmount` is a JSON float
    // in reais (SalesModule: numberFormat:'currency'); accounting stores integer cents.
    // Convert here, exactly once, with hard guards — this is the single point where float
    // imprecision could re-enter the exact-integer money path.
    // ponytail: Math.round(reais*100) is the ceiling; if sales ever store cents natively,
    // drop the *100 and the round.
    const amount = event.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new ValidationError(
        `Valor inválido para lançamento de receita (venda '${event.sourceId}'): não é um número finito.`,
      );
    }
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents)) {
      throw new ValidationError(
        `Valor fora da faixa segura de centavos (venda '${event.sourceId}').`,
      );
    }
    if (amountCents <= 0) {
      throw new ValidationError(
        `Valor deve ser maior que zero para reconhecer receita (venda '${event.sourceId}').`,
      );
    }

    // Split the credit by nature (ADR-INCR-REVENUE-SPLIT D5) via the CANONICAL splitter
    // (revenueSplit.ts — shared with the CRM mapper so the technique cannot drift per mapper).
    const creditLines = splitRevenueCredit(amountCents, event.revenueByNature);

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `Receita salão — Venda ${event.sourceId}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: SalonSaleFinalizedMapper.DEBIT_ACCOUNT, debitCents: amountCents, creditCents: 0 },
        ...creditLines,
      ],
    };
  }

}
