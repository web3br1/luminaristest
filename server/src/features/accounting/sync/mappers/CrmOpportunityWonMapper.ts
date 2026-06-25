import { ValidationError } from '../../../../lib/errors';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';

/**
 * Maps `crm.opportunity.won` → revenue recognition entry:
 *   Débito  1.1.2 (A Receber)        = amountCents
 *   Crédito 3.1   (Receita de Vendas) = amountCents
 * Both are canonical leaf accounts (acceptsEntries=true) in ChartOfAccountsFixture.
 */
export class CrmOpportunityWonMapper implements IAccountingEventMapper {
  public readonly sourceType = 'crm.opportunity.won' as const;

  /** Leaf account codes (canonical chart). */
  private static readonly DEBIT_ACCOUNT = '1.1.2'; // A Receber
  private static readonly CREDIT_ACCOUNT = '3.1'; //  Receita de Vendas

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1). The CRM `amount` is a JSON float in reais
    // (OpportunitiesModule: numberFormat:'currency'); accounting stores integer
    // cents. Convert here, exactly once, with hard guards — this is the single
    // point where float imprecision could re-enter the exact-integer money path.
    // ponytail: Math.round(reais*100) is the ceiling; if the source ever stores
    // cents natively, drop the *100 and the round.
    const amount = event.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new ValidationError(
        `Valor inválido para lançamento de receita (oportunidade '${event.sourceId}'): não é um número finito.`,
      );
    }
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents)) {
      throw new ValidationError(
        `Valor fora da faixa segura de centavos (oportunidade '${event.sourceId}').`,
      );
    }
    if (amountCents <= 0) {
      throw new ValidationError(
        `Valor deve ser maior que zero para reconhecer receita (oportunidade '${event.sourceId}').`,
      );
    }

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `Receita — ${event.label}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: CrmOpportunityWonMapper.DEBIT_ACCOUNT, debitCents: amountCents, creditCents: 0 },
        { accountCode: CrmOpportunityWonMapper.CREDIT_ACCOUNT, debitCents: 0, creditCents: amountCents },
      ],
    };
  }
}
