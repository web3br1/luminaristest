import { ValidationError } from '../../../../lib/errors';
import type { PostEntryInput } from '../../dtos/PostingDto';
import type { AccountingEvent } from '../AccountingSyncPort';
import type { IAccountingEventMapper } from './IAccountingEventMapper';

/**
 * Maps `salon.package.sold` → prepaid-package ORIGIN entry (Incremento G P4):
 *   Débito  1.1.2 (A Receber)            = amountCents
 *   Crédito 2.1.1 (Pacotes Pré-pagos)    = amountCents
 *
 * Selling a prepaid package is NOT revenue — it creates a LIABILITY (deferred revenue).
 * Revenue is recognized later, at consumption (a future sale paid with Package Balance).
 * The settlement of THIS receivable (A Receber → Caixa/Banco/Cartão) reuses the existing
 * `salon.sale.settled` flow. Distinct sourceType keeps it isolated from the gated-out
 * `salon.sale.finalized` revenue entry on the @@unique idempotency key.
 */
export class SalonPackageSoldMapper implements IAccountingEventMapper {
  public readonly sourceType = 'salon.package.sold' as const;

  /** Leaf account codes (canonical chart). */
  private static readonly DEBIT_ACCOUNT = '1.1.2'; // A Receber
  private static readonly CREDIT_ACCOUNT = '2.1.1'; // Pacotes Pré-pagos (liability)

  public map(event: AccountingEvent): PostEntryInput {
    // MONEY BOUNDARY (Contract §2.1). The salon `totalAmount` is a JSON float in reais;
    // accounting stores integer cents. Convert here, exactly once, with hard guards.
    const amount = event.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new ValidationError(
        `Valor inválido para origem de pacote (venda '${event.sourceId}'): não é um número finito.`,
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
        `Valor deve ser maior que zero para registrar origem de pacote (venda '${event.sourceId}').`,
      );
    }

    return {
      unitId: event.unitId,
      date: event.occurredAt,
      description: `Origem de pacote pré-pago — Venda ${event.sourceId}`,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      lines: [
        { accountCode: SalonPackageSoldMapper.DEBIT_ACCOUNT, debitCents: amountCents, creditCents: 0 },
        { accountCode: SalonPackageSoldMapper.CREDIT_ACCOUNT, debitCents: 0, creditCents: amountCents },
      ],
    };
  }
}
