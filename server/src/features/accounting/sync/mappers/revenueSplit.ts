/**
 * revenueSplit — canonical revenue-by-nature credit splitter (ADR-INCR-REVENUE-SPLIT D5).
 *
 * Single source of the 3.1/3.3 split technique, shared by EVERY revenue-recognition mapper
 * (SalonSaleFinalizedMapper since PR #66; the retired CrmOpportunityWonMapper used it between
 * the N4 seam fix and ADR-CRM-AR-SEAM, which rerouted CRM through the AR subledger).
 * Extracted so the technique cannot be re-inlined and drift per mapper (class
 * `reuse-criterion-blind-to-reinlined-technique` — the parseBrl money bug was exactly this
 * failure mode materialized).
 *
 * Contract:
 *  - the proportion comes from the RAW per-nature subtotals (reais); it is applied to
 *    `totalCents` (the actual booked total, already net of any header discount/tax) so a
 *    header discount rateia proportionally between natures;
 *  - the rounding residue is absorbed by the product line (productCents = total − serviceCents),
 *    guaranteeing serviceCents + productCents === totalCents (no cent lost — exact integer);
 *  - zero-value lines are omitted; with no usable breakdown (absent or base <= 0) it falls back
 *    to a single 3.1 credit (backwards-compatible).
 */

/** Canonical leaf account codes for revenue by nature (ChartOfAccountsFixture). */
export const SERVICE_REVENUE_ACCOUNT = '3.1'; // Receita de Serviços (renamed by REVENUE-SPLIT — was "Receita de Vendas")
export const RESALE_REVENUE_ACCOUNT = '3.3'; //  Receita de Revenda de Mercadorias

export interface RevenueCreditLine {
  accountCode: string;
  debitCents: number;
  creditCents: number;
}

/** Build the balanced credit legs summing EXACTLY to `totalCents`, split by nature. */
export function splitRevenueCredit(
  totalCents: number,
  revenueByNature?: { serviceReais: number; productReais: number },
): RevenueCreditLine[] {
  const service = revenueByNature?.serviceReais ?? 0;
  const product = revenueByNature?.productReais ?? 0;
  const base = service + product;

  // No usable breakdown → single services-account credit (backwards-compatible).
  if (base <= 0) {
    return [{ accountCode: SERVICE_REVENUE_ACCOUNT, debitCents: 0, creditCents: totalCents }];
  }

  const serviceCents = Math.round(totalCents * (service / base));
  const productCents = totalCents - serviceCents; // residue lands here → Σ === totalCents

  const lines: RevenueCreditLine[] = [];
  if (serviceCents > 0) {
    lines.push({ accountCode: SERVICE_REVENUE_ACCOUNT, debitCents: 0, creditCents: serviceCents });
  }
  if (productCents > 0) {
    lines.push({ accountCode: RESALE_REVENUE_ACCOUNT, debitCents: 0, creditCents: productCents });
  }
  return lines;
}
