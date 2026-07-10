import { createHash } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../../../lib/errors';
import * as storage from '../../../lib/attachmentStorage';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { IDataExchangeRepository } from '../repositories/IDataExchangeRepository';
import type { AuditService } from './AuditService';
import type { ReferentialMappingService } from './ReferentialMappingService';
import type { AccountingReportService } from './AccountingReportService';
import { toJobResponse, type DataExchangeJobResponse } from './dataExchangeMappers';
import type { SpedEcdRequestDto } from '../dtos/SpedEcdDto';
import { LEDGER_STATUSES } from '../models/ledgerStatus';
import {
  buildEcdFile,
  serializeEcd,
  type EcdFileInput,
  type EcdI050Node,
  type EcdMonth,
  type EcdEntry,
  type RegI155Input,
  type RegJ100Line,
  type RegJ150Line,
} from '../../../lib/sped';

/** Account.nature -> I050 COD_NAT (manual p. 118 table). */
function natureToCodNat(nature: string): string {
  switch (nature) {
    case 'Asset':
      return '01';
    case 'Liability':
      return '02';
    case 'Equity':
      return '03';
    case 'Revenue':
    case 'Expense':
      return '04'; // Contas de Resultado
    default:
      return '09'; // Outras
  }
}

/** Level = depth of the dot-separated hierarchical code ("1.1.2" -> 3). */
function codeLevel(code: string): number {
  return code.split('.').length;
}

/** Immediate parent code ("1.1.2" -> "1.1"), or undefined at the top level. */
function parentCode(code: string): string | undefined {
  const parts = code.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : undefined;
}

const TWO = (n: number) => String(n).padStart(2, '0');

/**
 * SPED ECD (SPED Contábil) file generation (ADR-INCR-SPED-ECD). READ-ONLY over
 * the ledger + ONE metadata write (the export job): NO Posting/JournalEntry
 * write, no period gate (D7). Composes the register data from the existing
 * report/chart/mapping reads, hands it to the pure `lib/sped` serializer (D2),
 * persists the `.txt` via the reused disk store and records an EXPORT job +
 * `sped.ecd_generated` audit in one tx (mirrors DataExchangeExportService).
 *
 * Coverage gate (D5): a leaf account with no referential mapping in the version
 * blocks generation with a ValidationError — no partial file is produced.
 *
 * Honest residual (ADR §5): PVA-clean IMPORT is a human sign-off. Value-level
 * J100/J150 reconciliation (REGRA_SOMA_DAS_PARCELAS / BALANCO_SALDO / ATIVO_
 * PASSIVO) presupposes the deferred apuração/encerramento (I350/I355 + a
 * retained-earnings posting): with the period result unclosed, the P-side
 * totalizer includes the result (so A=P holds, matching balanceSheet.balanced)
 * but its detail children sum short by exactly that result. The STRUCTURE
 * (register order/count, field layout, REGRA_OBRIGATORIO_I052) is fully met.
 */
export class SpedGenerationService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly referential: ReferentialMappingService,
    private readonly reports: AccountingReportService,
    private readonly policy: IAccountingPolicy,
    private readonly repo: IDataExchangeRepository,
    private readonly audit: AuditService,
  ) {}

  public async generate(scope: AccountingScope, dto: SpedEcdRequestDto): Promise<DataExchangeJobResponse> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a gerar a ECD.');
    }

    const { year } = dto;
    const dtIni = `${year}-01-01`;
    const dtFin = `${year}-12-31`;

    // ── Coverage gate (D5) — bloqueia a geração se houver conta-folha sem mapeamento.
    const coverage = await this.referential.coverage(scope, dto.mappingVersion);
    if (!coverage.ready) {
      throw new ValidationError(
        'Cobertura referencial incompleta: mapeie todas as contas analíticas antes de gerar a ECD.',
        { unmappedAccounts: coverage.unmappedAccounts, mappingVersion: dto.mappingVersion },
      );
    }

    const input = await this.composeFile(scope, dto, dtIni, dtFin);
    const lines = buildEcdFile(input);
    const text = serializeEcd(lines);
    const buffer = Buffer.from(text, 'latin1'); // ISO-8859-1 (PVA-7)
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const fileName = `ecd_${dto.declarant.cnpj}_${year}.txt`;

    const job = await this.repo.createJob({
      userId: scope.ownerUserId,
      unitId: scope.unitId,
      direction: 'EXPORT',
      kind: 'EXPORT_SPED_ECD',
      status: 'EXPORTED',
      requestedById: scope.actorUserId,
      originalName: fileName,
      mimeType: 'text/plain',
      sizeBytes: buffer.length,
      sha256,
      totalRows: lines.length,
    });

    const { storageKey } = await storage.saveFile(
      scope.ownerUserId,
      scope.unitId,
      job.id,
      fileName,
      buffer,
    );

    const updated = await this.repo.runTransaction(async (tx) => {
      const j = await this.repo.updateJob(scope, job.id, { storageKey }, tx);
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'sped.ecd_generated',
        targetType: 'data_exchange_job',
        targetId: job.id,
        payload: {
          jobId: job.id,
          kind: 'EXPORT_SPED_ECD',
          year: String(year),
          mappingVersion: dto.mappingVersion,
          sha256,
          lineCount: String(lines.length),
        },
      });
      return j;
    });

    return toJobResponse(updated);
  }

  /** Composes the full `EcdFileInput` from the ledger reads. Pure of I/O concerns. */
  private async composeFile(
    scope: AccountingScope,
    dto: SpedEcdRequestDto,
    dtIni: string,
    dtFin: string,
  ): Promise<EcdFileInput> {
    const { year } = dto;
    const accounts = await this.accountRepo.findManyByUnit(scope); // ordered by code
    const mappings = await this.referential.listMappings(scope, dto.mappingVersion);
    const refByAccount = new Map(mappings.map((m) => [m.accountId, m.referentialCode]));
    const codeSet = new Set(accounts.map((a) => a.code));

    // ── I050 (+ I051 + I052) ──
    const i050Nodes: EcdI050Node[] = accounts.map((a) => {
      const sup = parentCode(a.code);
      return {
        account: {
          dtAlt: dtIni, // MVP: data de alteração = início do exercício
          codNat: natureToCodNat(a.nature),
          indCta: a.acceptsEntries ? 'A' : 'S',
          nivel: codeLevel(a.code),
          codCta: a.code,
          codCtaSup: sup && codeSet.has(sup) ? sup : undefined,
          cta: a.name,
        },
        refCode: a.acceptsEntries ? refByAccount.get(a.id) : undefined,
        aglCode: a.acceptsEntries ? a.code : undefined, // D12: aglutinação 1:1
      };
    });

    // ── I150/I155 mensal com carry-forward (D11) ──
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const opening = await this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, {
      to: new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999)),
    });
    const openingByAccount = new Map(opening.map((t) => [t.accountId, t.debitCents - t.creditCents]));

    // Universo de contas-folha com saldo de abertura ou movimento no ano.
    const running = new Map<string, number>(); // accountId -> saldo corrente (signed)
    const universe = new Set<string>();
    for (const [id, bal] of openingByAccount) {
      running.set(id, bal);
      if (bal !== 0) universe.add(id);
    }

    const monthlyTotals: Array<Map<string, { debit: number; credit: number }>> = [];
    for (let m = 0; m < 12; m++) {
      const from = new Date(`${year}-${TWO(m + 1)}-01T00:00:00.000Z`);
      const lastDay = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      const to = new Date(`${year}-${TWO(m + 1)}-${TWO(lastDay)}T23:59:59.999Z`);
      const totals = await this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, { from, to });
      const byAccount = new Map<string, { debit: number; credit: number }>();
      for (const t of totals) {
        byAccount.set(t.accountId, { debit: t.debitCents, credit: t.creditCents });
        if (t.debitCents !== 0 || t.creditCents !== 0) universe.add(t.accountId);
      }
      monthlyTotals.push(byAccount);
    }

    // Ordena o universo por code (determinismo); só contas-folha existentes.
    const universeAccounts = [...universe]
      .map((id) => accountById.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a && a.acceptsEntries)
      .sort((a, b) => a.code.localeCompare(b.code));

    const months: EcdMonth[] = [];
    for (let m = 0; m < 12; m++) {
      const lastDay = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      const mIni = `${year}-${TWO(m + 1)}-01`;
      const mFin = `${year}-${TWO(m + 1)}-${TWO(lastDay)}`;
      const totals = monthlyTotals[m];
      const saldos: RegI155Input[] = universeAccounts.map((a) => {
        const saldoIni = running.get(a.id) ?? 0;
        const mv = totals.get(a.id) ?? { debit: 0, credit: 0 };
        const saldoFin = saldoIni + mv.debit - mv.credit;
        running.set(a.id, saldoFin); // carry-forward para o próximo mês
        return {
          codCta: a.code,
          saldoIniCents: saldoIni,
          debitCents: mv.debit,
          creditCents: mv.credit,
          saldoFinCents: saldoFin,
        };
      });
      months.push({ dtIni: mIni, dtFin: mFin, saldos });
    }

    // ── I200/I250 (Diário completo por janela, D9) ──
    const rawEntries = await this.journalEntryRepo.findManyForExport(scope, LEDGER_STATUSES, {
      from: new Date(`${dtIni}T00:00:00.000Z`),
      to: new Date(`${dtFin}T23:59:59.999Z`),
    });
    const entries: EcdEntry[] = rawEntries.map((e) => {
      const legs = [...e.postings]
        .sort((a, b) => a.account.code.localeCompare(b.account.code) || (b.debitCents - a.debitCents))
        .map((p) => ({
          codCta: p.account.code,
          vlCents: p.debitCents > 0 ? p.debitCents : p.creditCents,
          indDc: (p.debitCents > 0 ? 'D' : 'C') as 'D' | 'C',
          hist: e.description,
        }));
      const vlLctoCents = e.postings.reduce((s, p) => s + p.debitCents, 0);
      return {
        entry: {
          numLcto: String(e.entryNumber),
          dtLcto: e.date.toISOString().slice(0, 10),
          vlLctoCents,
        },
        legs,
      };
    });

    // ── J100 / J150 (via INCR-4) ──
    const asOf = new Date(`${dtFin}T00:00:00.000Z`);
    const [bp, dre] = await Promise.all([
      this.reports.balanceSheet(scope, asOf),
      this.reports.incomeStatement(scope, asOf),
    ]);

    const balanceSheet = this.buildJ100(bp);
    const incomeStatement = this.buildJ150(dre);

    return {
      declarant: {
        dtIni,
        dtFin,
        nome: dto.declarant.nome,
        cnpj: dto.declarant.cnpj,
        uf: dto.declarant.uf,
        ie: dto.declarant.ie,
        codMun: dto.declarant.codMun,
        im: dto.declarant.im,
        indSitEsp: dto.declarant.indSitEsp,
        indSitIniPer: dto.declarant.indSitIniPer,
        indNire: dto.declarant.indNire,
        indFinEsc: dto.declarant.indFinEsc,
        codHashSub: dto.declarant.codHashSub,
        indGrandePorte: dto.declarant.indGrandePorte,
        tipEcd: dto.declarant.tipEcd,
        codScp: dto.declarant.codScp,
        identMf: dto.declarant.identMf,
        indEscCons: dto.declarant.indEscCons,
        indCentralizada: dto.declarant.indCentralizada,
        indMudancPc: dto.declarant.indMudancPc,
        codPlanRef: dto.declarant.codPlanRef,
      },
      indEsc: 'G', // Diário Geral (D4)
      book: {
        numOrd: dto.book.numOrd,
        natLivr: dto.book.natLivr,
        nire: dto.book.nire,
        dtArq: dto.book.dtArq,
        dtArqConv: dto.book.dtArqConv,
        descMun: dto.book.descMun,
        dtExSocial: dto.book.dtExSocial,
      },
      accounts: i050Nodes,
      months,
      entries,
      balanceSheet,
      incomeStatement,
      signers: dto.signers,
    };
  }

  /**
   * Maps a BalanceSheetReport to J100 aglutination lines: one Totalizador per side
   * (Ativo / Passivo+PL) at NIVEL_AGL 1, plus one Detalhe per account under it.
   * COD_AGL = account code (1:1 with I052, D12). D/C is encoded in the signed cents
   * passed to the builder: A-side keeps the presentation sign (debit-positive), P-side
   * negates it so a normal credit balance serialises as "C" (see class residual note).
   */
  private buildJ100(bp: {
    assets: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string };
    liabilities: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string };
    equity: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string };
    netResultLine: { amountCents: string };
  }): RegJ100Line[] {
    const lines: RegJ100Line[] = [];
    const assetsTotal = parseInt(bp.assets.totalCents, 10);
    // P side inclui o resultado do exercício (mantém A=P, = balanceSheet.balanced).
    const passivoPlTotal =
      parseInt(bp.liabilities.totalCents, 10) +
      parseInt(bp.equity.totalCents, 10) +
      parseInt(bp.netResultLine.amountCents, 10);

    lines.push({
      codAgl: 'BP_ATIVO', indCodAgl: 'T', nivelAgl: 1, indGrpBal: 'A',
      descr: 'ATIVO', vlIniCents: 0, vlFinCents: assetsTotal,
    });
    for (const a of bp.assets.accounts) {
      lines.push({
        codAgl: a.code, indCodAgl: 'D', nivelAgl: 2, codAglSup: 'BP_ATIVO', indGrpBal: 'A',
        descr: a.name, vlIniCents: 0, vlFinCents: parseInt(a.amountCents, 10),
      });
    }

    lines.push({
      codAgl: 'BP_PASSIVO_PL', indCodAgl: 'T', nivelAgl: 1, indGrpBal: 'P',
      descr: 'PASSIVO E PATRIMÔNIO LÍQUIDO', vlIniCents: 0, vlFinCents: -passivoPlTotal,
    });
    for (const a of [...bp.liabilities.accounts, ...bp.equity.accounts]) {
      lines.push({
        codAgl: a.code, indCodAgl: 'D', nivelAgl: 2, codAglSup: 'BP_PASSIVO_PL', indGrpBal: 'P',
        descr: a.name, vlIniCents: 0, vlFinCents: -parseInt(a.amountCents, 10),
      });
    }
    return lines;
  }

  /**
   * Maps an IncomeStatementReport to J150 lines. Revenue sides serialise as "C"
   * (negated), expense/deduction sides as "D". IND_GRP_DRE: R for revenue, D for
   * expense/deduction. NU_ORDEM is a stable presentation sequence.
   */
  private buildJ150(dre: {
    grossRevenue: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string };
    revenueDeductions: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string };
    expenses: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string };
    netResult: { amountCents: string };
  }): RegJ150Line[] {
    const lines: RegJ150Line[] = [];
    let ordem = 1;
    const pushSection = (
      totCode: string,
      totDescr: string,
      section: { accounts: { code: string; name: string; amountCents: string }[]; totalCents: string },
      grp: 'R' | 'D',
      negate: boolean,
    ) => {
      const sign = negate ? -1 : 1;
      lines.push({
        nuOrdem: ordem++, codAgl: totCode, indCodAgl: 'T', nivelAgl: 1,
        descr: totDescr, vlIniCents: 0, vlFinCents: sign * parseInt(section.totalCents, 10), indGrpDre: grp,
      });
      for (const a of section.accounts) {
        lines.push({
          nuOrdem: ordem++, codAgl: a.code, indCodAgl: 'D', nivelAgl: 2, codAglSup: totCode,
          descr: a.name, vlIniCents: 0, vlFinCents: sign * parseInt(a.amountCents, 10), indGrpDre: grp,
        });
      }
    };

    pushSection('DRE_RECEITA', 'RECEITA BRUTA', dre.grossRevenue, 'R', true);
    pushSection('DRE_DEDUCOES', 'DEDUÇÕES DA RECEITA', dre.revenueDeductions, 'D', false);
    pushSection('DRE_DESPESAS', 'DESPESAS', dre.expenses, 'D', false);
    lines.push({
      nuOrdem: ordem++, codAgl: 'DRE_RESULTADO', indCodAgl: 'T', nivelAgl: 1,
      descr: 'RESULTADO LÍQUIDO DO EXERCÍCIO', vlIniCents: 0,
      vlFinCents: -parseInt(dre.netResult.amountCents, 10), indGrpDre: 'R',
    });
    return lines;
  }
}
