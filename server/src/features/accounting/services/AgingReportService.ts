import { ForbiddenError, ValidationError } from '../../../lib/errors';
import type { IPayableRepository } from '../repositories/IPayableRepository';
import type { IReceivableRepository } from '../repositories/IReceivableRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import { isValidDateOnly } from '../models/dates';
import type { AccountingReportService } from './AccountingReportService';
import { findMappingRule, applySign } from './StatementMappingFixture';
import {
  FORNECEDORES_A_PAGAR_CODE,
  CLIENTES_A_RECEBER_CODE,
} from '../fixtures/ChartOfAccountsFixture';

// ─── Buckets (F-AG2→a, fixas) ───────────────────────────────────────────────────

/**
 * Faixas de atraso FIXAS (F-AG2→a, YAGNI — não configuráveis): `A vencer` (dueDate ≥ as_of, i.e.
 * atraso ≤ 0) e as faixas de atraso `1–30`, `31–60`, `61–90`, `>90` dias. A ordem deste array É a
 * ordem de exibição/serialização e a fonte de verdade das chaves do envelope.
 */
export const AGING_BUCKETS = ['a_vencer', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
export type AgingBucketId = (typeof AGING_BUCKETS)[number];

/** Rótulo do grupo para linhas sem contraparte (counterpartyId NULL). */
export const NO_COUNTERPARTY_LABEL = '(Sem contraparte)';

/**
 * Número do dia-calendário UTC (dias inteiros desde a época) de um instante, extraído POR COMPONENTE
 * (getUTCFullYear/Month/Date → Date.UTC). Isto é imune ao bug de classe UTC-shift
 * (date-only-rendering-utc-shift-class-bug): jamais usa o fuso local nem depende da hora-do-dia com que
 * o `dueDate` foi persistido — floreia para a MEIA-NOITE UTC daquela data-calendário. `dueDate` é gravado
 * como `new Date('YYYY-MM-DD')` (meia-noite UTC), então o resultado é exato.
 */
function toUtcDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/** Dia-calendário UTC de uma data-only `YYYY-MM-DD` (já validada), por componente — nunca via fuso local. */
function dayNumberFromDateOnly(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map((n) => parseInt(n, 10));
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * "Hoje" como date-only UTC. FONTE ÚNICA — usada TANTO para o default de `asOf` QUANTO para o teste
 * `asOf == hoje` do tie-out. Isto não é cosmético: se as duas noções de "hoje" divergissem, uma
 * chamada SEM `asOf` (que é, por definição, a posição de hoje) poderia cair no ramo
 * `as_of_not_today` e suprimir o tie-out justamente no único caso em que ele é sempre válido.
 * Com um helper só, "asOf omitido ⇒ tie-out calculado" vale por construção.
 */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Classifica os dias de atraso (`as_of − dueDate`, inteiro com sinal) numa faixa. atraso ≤ 0 ⇒ `A vencer`
 * (inclui vencendo HOJE: dueDate == as_of é "a vencer" pela regra dueDate ≥ as_of). O atraso começa em 1.
 */
export function bucketForDaysOverdue(daysOverdue: number): AgingBucketId {
  if (daysOverdue <= 0) return 'a_vencer';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_plus';
}

// ─── Report shapes (money em INTEGER CENTS, serializado como string) ─────────────

/** Uma linha do drill por documento dentro de um grupo de contraparte. */
export interface AgingDocumentLine {
  id: string;
  documentNumber: string | null;
  /** date-only `YYYY-MM-DD` do vencimento. */
  dueDate: string;
  /** `as_of − dueDate` em dias (inteiro; negativo/0 = a vencer). */
  daysOverdue: number;
  bucket: AgingBucketId;
  /** Outstanding da linha = `amountCents` (pagamento full-only, sem saldo parcial). */
  amountCents: string;
}

/** Um grupo por contraparte, com totais por faixa + total do grupo + drill por documento. */
export interface AgingCounterpartyGroup {
  /** FK Counterparty, ou null para o grupo "(Sem contraparte)". */
  counterpartyId: string | null;
  /** Nome-snapshot (supplierName/customerName) da contraparte; `NO_COUNTERPARTY_LABEL` no grupo null. */
  counterpartyName: string;
  /** Total por faixa (cents string) — chaves = AGING_BUCKETS. */
  buckets: Record<AgingBucketId, string>;
  /** Σ das faixas do grupo. */
  totalCents: string;
  documents: AgingDocumentLine[];
}

// ─── Tie-out subledger ↔ razão (F-AG4→b, EMENDA 2026-07-15) ─────────────────────

/**
 * Conta de controle (razão) por subrazão. AP credita/debita `2.1.2 Fornecedores a Pagar`; AR debita/
 * credita `1.1.5 Clientes a Receber` — a conta **DEDICADA** do INCR-AR F7, NÃO a `1.1.2` do salão: é
 * exatamente por ela ser dedicada que o tie-out pode fechar. Resolvidas por CÓDIGO via as constantes
 * canônicas do fixture (nunca string solta, nunca por nome).
 */
export const AGING_CONTROL_ACCOUNT_CODE: Record<AgingKind, string> = {
  payable: FORNECEDORES_A_PAGAR_CODE,
  receivable: CLIENTES_A_RECEBER_CODE,
};

/**
 * Por que o tie-out foi OMITIDO. Emitir `tieOut: null` + motivo é uma decisão deliberada da emenda:
 * um número errado é pior que número nenhum.
 *  - `as_of_not_today` — o outstanding do subrazão vem do status ATUAL da linha, não do status
 *    histórico na `as_of`; logo o tie-out só é válido com `as_of == hoje`. Reconstruir o outstanding
 *    histórico é outro problema (fora de escopo).
 *  - `control_account_missing` — a conta de controle não existe no plano do escopo (nada a comparar).
 *  - `control_account_not_balance_sheet_nature` — guarda de integridade: a conta de controle existe mas
 *    tem natureza fora do BP (nem Asset nem Liability), logo não há lado natural para normalizar o
 *    sinal. Inalcançável com o plano canônico (2.1.2=Liability, 1.1.5=Asset); só dispara em plano
 *    corrompido — e aí o certo é omitir, não chutar um sinal.
 */
export const TIE_OUT_SKIPPED_REASONS = [
  'as_of_not_today',
  'control_account_missing',
  'control_account_not_balance_sheet_nature',
] as const;
export type TieOutSkippedReason = (typeof TIE_OUT_SKIPPED_REASONS)[number];

/**
 * A prova subledger↔razão: o total do aging confrontado com o saldo da conta de controle na `as_of`.
 * Money em INTEGER CENTS serializado como string (convenção INCR-4, igual ao resto do envelope).
 */
export interface AgingTieOut {
  /** Código da conta de controle confrontada (`2.1.2` p/ AP, `1.1.5` p/ AR). */
  controlAccountCode: string;
  /** Σ do aging (sempre positivo). */
  subledgerTotalCents: string;
  /**
   * Saldo da conta de controle NORMALIZADO PELA NATUREZA (magnitude no lado natural, sempre
   * comparável ao total do aging) — jamais o sinal cru `débito − crédito`.
   */
  controlAccountBalanceCents: string;
  /** `subledgerTotalCents − controlAccountBalanceCents` (inteiro exato, sem epsilon). */
  differenceCents: string;
  /** `differenceCents === 0` — igualdade INTEIRA exata. */
  tiesOut: boolean;
}

/** Envelope do relatório de aging (posição por contraparte × faixa de vencimento). */
export interface AgingReport {
  unitId: string;
  kind: AgingKind;
  /** date-only `YYYY-MM-DD` da posição (default hoje). */
  asOf: string;
  /** Total geral por faixa (cents string). Σ faixas === totalCents === Σ grupos. */
  buckets: Record<AgingBucketId, string>;
  totalCents: string;
  groups: AgingCounterpartyGroup[];
  /** Tie-out subledger↔razão, ou `null` quando não é emitível — aí `tieOutSkippedReason` diz por quê. */
  tieOut: AgingTieOut | null;
  /** Motivo da omissão do tie-out; `null` exatamente quando `tieOut !== null` (mutuamente exclusivos). */
  tieOutSkippedReason: TieOutSkippedReason | null;
}

export type AgingKind = 'payable' | 'receivable';

// ─── Linha normalizada (AP e AR compartilham a mesma forma para o agrupamento) ───

interface OutstandingLine {
  id: string;
  documentNumber: string | null;
  dueDate: Date;
  amountCents: number;
  counterpartyId: string | null;
  /** supplierName (AP) / customerName (AR) — snapshot por linha. */
  counterpartyName: string;
}

/** Chave interna do grupo: o counterpartyId, ou um sentinela para o balde NULL (todas as linhas sem CP). */
const NULL_GROUP_KEY = ' __none__';

/** Cria um record de faixas zerado (INTEGER cents). */
function zeroBuckets(): Record<AgingBucketId, number> {
  return { a_vencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

/** Serializa um record de faixas numérico → string (convenção INCR-4). */
function serializeBuckets(b: Record<AgingBucketId, number>): Record<AgingBucketId, string> {
  return {
    a_vencer: String(b.a_vencer),
    d1_30: String(b.d1_30),
    d31_60: String(b.d31_60),
    d61_90: String(b.d61_90),
    d90_plus: String(b.d90_plus),
  };
}

/** Acumulador mutável por grupo. */
interface GroupAccumulator {
  counterpartyId: string | null;
  counterpartyName: string;
  buckets: Record<AgingBucketId, number>;
  total: number;
  documents: AgingDocumentLine[];
}

// ─── Service ────────────────────────────────────────────────────────────────────

/**
 * AgingReportService — relatório de aging / posição por contraparte (INCR-AGING), READ-ONLY,
 * FIRST-CLASS PRISMA, ZERO migração. Responde "quem me deve / eu devo quanto, e há quanto tempo",
 * recortado por contraparte × faixa de vencimento, para AP (`payable`) e AR (`receivable`).
 *
 * F-AG1→a (read-time puro): agrega na hora da consulta as linhas AP/AR EM ABERTO
 * (PAYABLE_OUTSTANDING_STATUSES / RECEIVABLE_OUTSTANDING_STATUSES) via o repositório scoped. Como o
 * pagamento é full-only (não há saldo parcial), o outstanding de cada linha É `amountCents`. Nenhuma
 * escrita no ledger; exclui PAID/RECEIVED, CANCELLED e soft-deleted no próprio repositório.
 *
 * INVARIANTE (inteiro exato, sem epsilon): total geral === Σ das faixas === Σ dos grupos. Vale por
 * construção — cada linha soma `amountCents` EXATAMENTE uma vez na sua faixa, no seu grupo e no total.
 *
 * O cálculo da faixa é component-based em UTC (toUtcDayNumber / dayNumberFromDateOnly), imune ao bug de
 * classe UTC-shift (date-only-rendering-utc-shift-class-bug) — nunca `new Date().getTime()` ingênuo.
 *
 * TIE-OUT (F-AG4→b, emenda 2026-07-15): o envelope também expõe a prova subledger↔razão — o total do
 * aging confrontado com o saldo da conta de controle (`2.1.2` AP / `1.1.5` AR) na `as_of`. É o que
 * transforma o aging de "relatório" em CONTROLE. O saldo NÃO é recalculado aqui: vem de
 * AccountingReportService.balancesAsOf (a mesma matemática de saldo do balancete/BP, derivada num
 * lugar só) — o acoplamento ao report service do razão é o custo que o fork (a) evitava e que a
 * emenda aceita explicitamente. Continua READ-ONLY e zero migração.
 */
export class AgingReportService {
  constructor(
    private readonly payableRepo: IPayableRepository,
    private readonly receivableRepo: IReceivableRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly reportService: AccountingReportService,
    private readonly policy: IAccountingPolicy,
  ) {}

  /**
   * Aging de AP ou AR na data `asOf` (date-only `YYYY-MM-DD`, default hoje quando omitido).
   * @throws ForbiddenError se a policy (canReadPayable/canReadReceivable, conforme kind) negar.
   * @throws ValidationError se `asOf` não for uma data real YYYY-MM-DD.
   */
  async aging(
    scope: AccountingScope,
    params: { kind: AgingKind; asOf?: string },
  ): Promise<AgingReport> {
    const { kind } = params;

    // Policy por kind (F: canReadPayable × canReadReceivable).
    const allowed = kind === 'payable' ? this.policy.canReadPayable(scope) : this.policy.canReadReceivable(scope);
    if (!allowed) {
      throw new ForbiddenError(
        kind === 'payable'
          ? 'Você não tem permissão para ler o aging de contas a pagar.'
          : 'Você não tem permissão para ler o aging de contas a receber.',
      );
    }

    // as_of: default hoje (UTC date-only); se fornecido, precisa ser data real (defensivo — o DTO já valida).
    const asOf = params.asOf ?? utcToday();
    if (!isValidDateOnly(asOf)) {
      throw new ValidationError('asOf deve ser uma data real YYYY-MM-DD.');
    }
    const asOfDay = dayNumberFromDateOnly(asOf);

    const lines = await this.loadOutstanding(scope, kind);

    // Agrupa por contraparte (counterpartyId; NULL → grupo único "(Sem contraparte)").
    const groups = new Map<string, GroupAccumulator>();
    const grandBuckets = zeroBuckets();
    let grandTotal = 0;

    for (const line of lines) {
      const daysOverdue = asOfDay - toUtcDayNumber(line.dueDate);
      const bucket = bucketForDaysOverdue(daysOverdue);

      const key = line.counterpartyId ?? NULL_GROUP_KEY;
      let group = groups.get(key);
      if (!group) {
        group = {
          counterpartyId: line.counterpartyId,
          counterpartyName: line.counterpartyId === null ? NO_COUNTERPARTY_LABEL : line.counterpartyName,
          buckets: zeroBuckets(),
          total: 0,
          documents: [],
        };
        groups.set(key, group);
      }

      group.buckets[bucket] += line.amountCents;
      group.total += line.amountCents;
      group.documents.push({
        id: line.id,
        documentNumber: line.documentNumber,
        dueDate: line.dueDate.toISOString().slice(0, 10),
        daysOverdue,
        bucket,
        amountCents: String(line.amountCents),
      });

      grandBuckets[bucket] += line.amountCents;
      grandTotal += line.amountCents;
    }

    // Ordem determinística dos grupos: por nome (o grupo NULL "(Sem contraparte)" cai naturalmente).
    const orderedGroups = [...groups.values()].sort((a, b) =>
      a.counterpartyName.localeCompare(b.counterpartyName, 'pt-BR'),
    );

    // Tie-out subledger↔razão sobre o MESMO grandTotal já apurado acima (nunca uma 2ª agregação).
    const tie = await this.computeTieOut(scope, kind, asOf, grandTotal);

    return {
      unitId: scope.unitId,
      kind,
      asOf,
      buckets: serializeBuckets(grandBuckets),
      totalCents: String(grandTotal),
      groups: orderedGroups.map((g) => ({
        counterpartyId: g.counterpartyId,
        counterpartyName: g.counterpartyName,
        buckets: serializeBuckets(g.buckets),
        totalCents: String(g.total),
        documents: g.documents,
      })),
      tieOut: tie.tieOut,
      tieOutSkippedReason: tie.tieOutSkippedReason,
    };
  }

  /**
   * Confronta o total do subrazão com o saldo da conta de controle na `as_of` (F-AG4→b).
   *
   * ⚠ CAVEAT DE SEMÂNTICA (o motivo do ramo `as_of_not_today`): o outstanding do subrazão é derivado do
   * status ATUAL da linha (findOutstanding filtra por status agora), não do status que ela tinha na
   * `as_of`. O saldo do razão, ao contrário, É histórico e exato em qualquer data. Comparar os dois
   * numa `as_of` que não é hoje confrontaria uma posição de HOJE com um saldo de ONTEM e produziria uma
   * "diferença" que não é erro nenhum — um número que MENTE. Por isso o increment se recusa a emiti-lo
   * e devolve `tieOut: null` + motivo. (Vale para `as_of` futura pela mesma razão: só HOJE os dois lados
   * falam da mesma data.)
   */
  private async computeTieOut(
    scope: AccountingScope,
    kind: AgingKind,
    asOf: string,
    subledgerTotalCents: number,
  ): Promise<{ tieOut: AgingTieOut | null; tieOutSkippedReason: TieOutSkippedReason | null }> {
    const skip = (reason: TieOutSkippedReason) => ({ tieOut: null, tieOutSkippedReason: reason });

    // Só HOJE os dois lados (status atual × saldo histórico) falam da mesma data. Mesmo `utcToday()`
    // que gera o default de `asOf` ⇒ chamada sem `asOf` NUNCA cai aqui.
    if (asOf !== utcToday()) return skip('as_of_not_today');

    const code = AGING_CONTROL_ACCOUNT_CODE[kind];
    const account = await this.accountRepo.findByCode(scope, code);
    if (!account) return skip('control_account_missing');

    /**
     * NORMALIZAÇÃO DE SINAL PELA NATUREZA — o ponto delicado. `balanceCents` do balancete é o sinal
     * CRU `débito − crédito`, logo um passivo com saldo credor vem NEGATIVO enquanto o total do aging é
     * sempre POSITIVO: comparar o cru faria o tie-out do AP falhar sempre (diferença = 2× o saldo) e o
     * do AR passar por acidente. A normalização não é re-inlinada aqui: reusa a regra canônica do BP
     * (findMappingRule + applySign), que já É a codificação versionada de "Asset ⇒ debit_positive
     * (débito−crédito), Liability ⇒ credit_positive (crédito−débito)". Reusar o canônico em vez de
     * reescrever `nature === 'Liability' ? -raw : raw` mantém tie-out e BP concordando sobre o saldo da
     * MESMA conta por construção — se divergissem, o controle acusaria erro onde o BP não vê nenhum.
     */
    const rule = findMappingRule(account.nature, account.code, 'BP');
    if (!rule) return skip('control_account_not_balance_sheet_nature');

    // Fim-do-dia UTC: inclui o dia inteiro no snapshot (mesma convenção do BP no controller).
    const rows = await this.reportService.balancesAsOf(scope, new Date(`${asOf}T23:59:59.999Z`));
    // Conta sem nenhuma partida não aparece no balancete — o saldo é genuinamente 0 (≠ conta ausente,
    // que já foi tratada acima como `control_account_missing`).
    const rawBalanceCents = rows.find((r) => r.accountId === account.id)?.balanceCents ?? 0;
    const controlAccountBalanceCents = applySign(rawBalanceCents, rule.sign);

    const differenceCents = subledgerTotalCents - controlAccountBalanceCents;

    return {
      tieOut: {
        controlAccountCode: code,
        subledgerTotalCents: String(subledgerTotalCents),
        controlAccountBalanceCents: String(controlAccountBalanceCents),
        differenceCents: String(differenceCents),
        // Igualdade INTEIRA exata (Contract §2.1) — nunca float/epsilon.
        tiesOut: differenceCents === 0,
      },
      tieOutSkippedReason: null,
    };
  }

  /** Carrega e normaliza as linhas em aberto do subrazão pedido para a forma comum. */
  private async loadOutstanding(scope: AccountingScope, kind: AgingKind): Promise<OutstandingLine[]> {
    if (kind === 'payable') {
      const rows = await this.payableRepo.findOutstanding(scope);
      return rows.map((r) => ({
        id: r.id,
        documentNumber: r.documentNumber,
        dueDate: r.dueDate,
        amountCents: r.amountCents,
        counterpartyId: r.counterpartyId,
        counterpartyName: r.supplierName,
      }));
    }
    const rows = await this.receivableRepo.findOutstanding(scope);
    return rows.map((r) => ({
      id: r.id,
      documentNumber: r.documentNumber,
      dueDate: r.dueDate,
      amountCents: r.amountCents,
      counterpartyId: r.counterpartyId,
      counterpartyName: r.customerName,
    }));
  }
}
