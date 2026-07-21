import { ValidationError } from '../../../../lib/errors';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';
import { splitRevenueCredit } from './revenueSplit';

/**
 * Maps `crm.opportunity.won` → revenue recognition entry:
 *   Débito  1.1.2 (A Receber)                       = amountCents
 *   Crédito 3.1   (Receita de Serviços)             = serviceCents
 *   Crédito 3.3   (Receita de Revenda de Mercadorias) = productCents  (when a split exists)
 * All are canonical leaf accounts (acceptsEntries=true) in ChartOfAccountsFixture.
 *
 * N4 seam fix (Council board v2): the credit goes through the SAME canonical splitter as the
 * salon mapper (revenueSplit.ts), so a CRM event carrying `revenueByNature` books per-nature —
 * the ECF-Presumido base (Bloco P reads 3.1 vs 3.3) stops being structurally wrong for resale
 * deals. TODAY CRM supplies no breakdown (OpportunitiesModule has no line items — verified),
 * so every live event falls back to a single 3.1 credit, same as before; the seam is now
 * split-CAPABLE instead of split-blind.
 *
 * KNOWN RESIDUE (N4 eixo a — orphan receivable): this debit shares the salon 1.1.2 and there is
 * NO CRM settlement bridge/mapper — a Won deal's receivable never clears against cash. A safe
 * settlement needs a payment FACT the CRM domain does not record (opportunities have no
 * paymentStatus/paidAt field), so inventing one here would fabricate ledger movement. The
 * tie-out diagnostic (Council E1 exception c) must cover 1.1.2 salão+CRM until a CRM payment
 * fact exists.
 */
export class CrmOpportunityWonMapper implements IAccountingEventMapper {
  public readonly sourceType = 'crm.opportunity.won' as const;

  /** Leaf account code (canonical chart). Credit codes live in revenueSplit.ts. */
  private static readonly DEBIT_ACCOUNT = '1.1.2'; // A Receber

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1). The CRM `amount` is a JSON float in reais
    // (OpportunitiesModule: numberFormat:'currency'); accounting stores integer
    // cents. Convert here, exactly once, with hard guards — this is the single
    // point where float imprecision could re-enter the exact-integer money path.
    // The Int32 ceiling (MAX_CENTS) is enforced downstream by the PostingService
    // choke-point guard (Council 1.5) — no per-border replica here.
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

    // Credit split by nature via the canonical splitter (fallback: single 3.1 credit).
    const creditLines = splitRevenueCredit(amountCents, event.revenueByNature);

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `Receita — ${event.label}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: CrmOpportunityWonMapper.DEBIT_ACCOUNT, debitCents: amountCents, creditCents: 0 },
        ...creditLines,
      ],
    };
  }
}
