import { ForbiddenError } from '../../../lib/errors';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository, AccountPostingTotals } from '../repositories/IPostingRepository';
import type { IReceivableRepository } from '../repositories/IReceivableRepository';
import type { IPayableRepository } from '../repositories/IPayableRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import { LEDGER_STATUSES } from '../models/ledgerStatus';
import {
  CLIENTES_A_RECEBER_CODE,
  FORNECEDORES_A_PAGAR_CODE,
} from '../fixtures/ChartOfAccountsFixture';
import type { AccountingEvent } from '../sync/AccountingSyncPort';
import { CRM_LEGACY_SOURCE_TYPE } from '../sync/AccountingSyncPort';

// ─── Constantes de domínio ────────────────────────────────────────────────────

/**
 * `1.1.2 A Receber` — conta-controle do contas-a-receber de PDV (salão). Os mappers do
 * AccountingSync a referenciam por código (SalonSale*Mapper / SalonPackageSoldMapper);
 * resolvida aqui por LOOKUP no plano (findByCode), nunca por id.
 */
export const POS_RECEIVABLE_CODE = '1.1.2';

/**
 * TODOS os sourceTypes que já alimentaram a 1.1.2. O board (Council 1.3) confirma que o CRM
 * também debitava 1.1.2 — desde o ADR-CRM-AR-SEAM o CRM entra pelo subrazão AR (1.1.5), então
 * 'crm.opportunity.won' aqui cobre a POPULAÇÃO LEGADA FECHADA (entradas pré-seam, sem
 * settlement possível); o tie-out da 1.1.2 compara o agregado (salão + CRM-legado) vs razão.
 * O Record força exaustividade nos DOIS sentidos contra a union `AccountingEvent['sourceType']`
 * + a chave legada: um 6º feeder novo quebra o tsc aqui (chave faltando) e um typo também
 * (chave extra). Incluir um feeder que não toque 1.1.2 é inócuo — a exclusão só afeta a linha
 * agregada da própria 1.1.2.
 */
const POS_FEEDER_SOURCE_TYPE_MAP: Record<
  AccountingEvent['sourceType'] | typeof CRM_LEGACY_SOURCE_TYPE,
  true
> = {
  [CRM_LEGACY_SOURCE_TYPE]: true,
  'salon.sale.finalized': true,
  'salon.sale.returned': true,
  'salon.sale.settled': true,
  'salon.package.sold': true,
  // CMV (INCR-INVENTORY): movimenta 4.2/1.1.6, nunca a 1.1.2 — presença aqui é só exaustividade.
  'salon.sale.cogs': true,
};

export const POS_FEEDER_SOURCE_TYPES = Object.keys(POS_FEEDER_SOURCE_TYPE_MAP) as Array<
  AccountingEvent['sourceType'] | typeof CRM_LEGACY_SOURCE_TYPE
>;

// ─── Report shapes (money em INTEGER CENTS, serializado como string — convenção INCR-4) ──

/** Identidade estável de cada verificação. */
export type TieOutCheckId = 'receivables' | 'payables' | 'pos_receivable';

/** Uma verificação subrazão ↔ conta-controle do razão. */
export interface TieOutCheck {
  id: TieOutCheckId;
  /** Código da conta-controle no plano (lookup por código, nunca id). */
  controlAccountCode: string;
  /** Nome da conta no plano, ou null se a conta ainda não existe no chart do escopo. */
  controlAccountName: string | null;
  /**
   * Lado do subrazão, em centavos (string). AR/AP: Σ `amountCents` das linhas em aberto
   * (OPEN + RECEIVING/PAYING). 1.1.2: agregado líquido (salão + CRM) das partidas com
   * sourceType de feeder PDV sobre a própria conta.
   */
  subledgerCents: string;
  /**
   * Lado do razão, em centavos (string), no sentido NATURAL da conta:
   * Asset = débito − crédito; Liability = crédito − débito.
   */
  ledgerCents: string;
  /** ledgerCents − subledgerCents (inteiro exato, sem epsilon). */
  differenceCents: string;
  /** true ⟺ differenceCents === 0 (igualdade inteira exata, Contrato §2.2-1). */
  balanced: boolean;
  /** Explicação legível de qual fonte alimenta cada lado. */
  detail: string;
}

/** Envelope do diagnóstico de tie-out. */
export interface TieOutDiagnosticReport {
  unitId: string;
  /** ISO datetime da geração (posição corrente — não há semântica as-of, ver DTO). */
  generatedAt: string;
  /** 'OK' ⟺ toda verificação fechou; qualquer divergência ⇒ 'DIVERGENT'. */
  status: 'OK' | 'DIVERGENT';
  checks: TieOutCheck[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * TieOutDiagnosticService — diagnóstico READ-ONLY de amarração subrazão ↔ razão
 * (FIX-TIEOUT, Council 1.3). ZERO escrita, ZERO migração, FIRST-CLASS PRISMA.
 *
 * Três verificações, todas em igualdade INTEIRA exata (centavos, sem epsilon):
 *
 *  (i)  AR em aberto (Σ Receivable OPEN+RECEIVING) === saldo devedor de `1.1.5 Clientes a
 *       Receber` — a conta-controle DEDICADA do AR-formal (INCR-AR F7). O invariante vale por
 *       construção (reconhecimento D 1.1.5 / recebimento C 1.1.5 / cancelamento = estorno) e
 *       este diagnóstico é o verificador externo que faltava (Council: "tie-out unchecked").
 *
 *  (ii) AP em aberto (Σ Payable OPEN+PAYING) === saldo credor de `2.1.2 Fornecedores a Pagar`.
 *
 *  (iii) `1.1.2 A Receber` (PDV): o razão da 1.1.2 deve ser INTEIRAMENTE explicado pelo agregado
 *       (salão + CRM) — o board confirma que o CRM também debita 1.1.2, então o lado "subrazão"
 *       é o líquido das partidas cujos entries têm sourceType de feeder PDV (salon.* + crm.*),
 *       computado como `saldo total − saldo excluindo feeders` (reusa o excludeSourceTypes que o
 *       repositório já tem — nenhum método novo). Divergência = partidas estranhas na
 *       conta-controle (ex.: lançamento manual em 1.1.2), exatamente o que o tie-out deve ACUSAR.
 *
 * Statuses: LEDGER_STATUSES (Posted+Reconciled+Reversed — nunca só 'Posted'; um estorno e o seu
 * original precisam anular-se, mesma regra dos demais relatórios read-only).
 *
 * Conta-controle ausente do chart (self-seed ainda não rodou): saldo do razão = 0 e o check só
 * acusa se o subrazão tiver valor — o diagnóstico REPORTA, nunca explode com NotFoundError.
 */
export class TieOutDiagnosticService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly receivableRepo: IReceivableRepository,
    private readonly payableRepo: IPayableRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  /**
   * Executa as três verificações de tie-out na posição corrente.
   * @throws ForbiddenError se a policy negar a leitura do razão.
   */
  async tieOut(scope: AccountingScope): Promise<TieOutDiagnosticReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o diagnóstico de amarração.');
    }

    const [totals, totalsSansFeeders, openReceivables, openPayables, arAccount, apAccount, posAccount] =
      await Promise.all([
        this.postingRepo.groupByAccount(scope, LEDGER_STATUSES),
        this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, {
          excludeSourceTypes: [...POS_FEEDER_SOURCE_TYPES],
        }),
        this.receivableRepo.findOutstanding(scope),
        this.payableRepo.findOutstanding(scope),
        this.accountRepo.findByCode(scope, CLIENTES_A_RECEBER_CODE),
        this.accountRepo.findByCode(scope, FORNECEDORES_A_PAGAR_CODE),
        this.accountRepo.findByCode(scope, POS_RECEIVABLE_CODE),
      ]);

    // (i) AR em aberto vs 1.1.5 (Asset: débito − crédito).
    const arOpenCents = openReceivables.reduce((acc, r) => acc + r.amountCents, 0);
    const arLedgerCents = arAccount ? debitBalance(totals, arAccount.id) : 0;
    const arCheck = buildCheck({
      id: 'receivables',
      controlAccountCode: CLIENTES_A_RECEBER_CODE,
      controlAccountName: arAccount?.name ?? null,
      subledgerCents: arOpenCents,
      ledgerCents: arLedgerCents,
      detail:
        'Σ Receivable em aberto (OPEN+RECEIVING) vs saldo devedor da conta-controle dedicada do AR.',
    });

    // (ii) AP em aberto vs 2.1.2 (Liability: crédito − débito).
    const apOpenCents = openPayables.reduce((acc, p) => acc + p.amountCents, 0);
    const apLedgerCents = apAccount ? creditBalance(totals, apAccount.id) : 0;
    const apCheck = buildCheck({
      id: 'payables',
      controlAccountCode: FORNECEDORES_A_PAGAR_CODE,
      controlAccountName: apAccount?.name ?? null,
      subledgerCents: apOpenCents,
      ledgerCents: apLedgerCents,
      detail:
        'Σ Payable em aberto (OPEN+PAYING) vs saldo credor da conta-controle do AP.',
    });

    // (iii) 1.1.2 (PDV): razão total vs agregado (salão + CRM). O líquido dos feeders é
    // `total − residual-sem-feeders`; divergência === residual (partidas fora dos feeders).
    const posLedgerCents = posAccount ? debitBalance(totals, posAccount.id) : 0;
    const posResidualCents = posAccount ? debitBalance(totalsSansFeeders, posAccount.id) : 0;
    const posFeederCents = posLedgerCents - posResidualCents;
    const posCheck = buildCheck({
      id: 'pos_receivable',
      controlAccountCode: POS_RECEIVABLE_CODE,
      controlAccountName: posAccount?.name ?? null,
      subledgerCents: posFeederCents,
      ledgerCents: posLedgerCents,
      detail:
        'Agregado (salão + CRM) das partidas com sourceType de feeder PDV vs saldo devedor da 1.1.2 — o CRM também debita 1.1.2, então o salão sozinho NUNCA fecha; divergência = partidas estranhas (ex.: lançamento manual) na conta-controle.',
    });

    const checks = [arCheck, apCheck, posCheck];
    return {
      unitId: scope.unitId,
      generatedAt: new Date().toISOString(),
      status: checks.every((c) => c.balanced) ? 'OK' : 'DIVERGENT',
      checks,
    };
  }
}

// ─── Helpers puros (module-level, sem estado) ────────────────────────────────

/** Saldo devedor (Asset): débito − crédito da conta, 0 se a conta não tem partidas. */
function debitBalance(totals: AccountPostingTotals[], accountId: string): number {
  const row = totals.find((t) => t.accountId === accountId);
  return row ? row.debitCents - row.creditCents : 0;
}

/** Saldo credor (Liability): crédito − débito da conta, 0 se a conta não tem partidas. */
function creditBalance(totals: AccountPostingTotals[], accountId: string): number {
  const row = totals.find((t) => t.accountId === accountId);
  return row ? row.creditCents - row.debitCents : 0;
}

/** Monta um TieOutCheck serializado (cents → string) com a igualdade inteira exata. */
function buildCheck(input: {
  id: TieOutCheckId;
  controlAccountCode: string;
  controlAccountName: string | null;
  subledgerCents: number;
  ledgerCents: number;
  detail: string;
}): TieOutCheck {
  const differenceCents = input.ledgerCents - input.subledgerCents;
  return {
    id: input.id,
    controlAccountCode: input.controlAccountCode,
    controlAccountName: input.controlAccountName,
    subledgerCents: String(input.subledgerCents),
    ledgerCents: String(input.ledgerCents),
    differenceCents: String(differenceCents),
    balanced: differenceCents === 0,
    detail: input.detail,
  };
}
