import { createHash } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../../../lib/errors';
import * as storage from '../../../lib/attachmentStorage';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IDataExchangeRepository } from '../repositories/IDataExchangeRepository';
import type { AuditService } from './AuditService';
import { toJobResponse, type DataExchangeJobResponse } from './dataExchangeMappers';
import type { SpedEcfRequestDto } from '../dtos/SpedEcfDto';
import { LEDGER_STATUSES } from '../models/ledgerStatus';
import { buildEcfFile, serializeEcf, type EcfFileInput, type EcfQuarter } from '../../../lib/ecf';

/**
 * Ledger account codes that map to a presunção activity line (ADR §Emenda FASE 2
 * ponto 5). These are the ONLY accounts whose receita bruta the ECF segregates;
 * any OTHER Revenue-nature account with movement fails the exhaustiveness gate.
 *   3.1 Receita de Serviços        → serviço (P200(8) 32% IRPJ, P400(4) 32% CSLL)
 *   3.3 Receita de Revenda de Merc. → revenda (P200(4) 8% IRPJ,  P400(2) 12% CSLL)
 */
const SERVICO_ACCOUNT_CODE = '3.1';
const REVENDA_ACCOUNT_CODE = '3.3';
const PRESUNCAO_ACCOUNT_CODES = new Set([SERVICO_ACCOUNT_CODE, REVENDA_ACCOUNT_CODE]);

/** Quarter windows (T01..T04) for a calendar year. */
function quarterWindows(year: number): Array<{ perApur: string; dtIni: string; dtFin: string; from: Date; to: Date }> {
  const q = (per: string, m0: number, mEnd: number, endDay: number) => ({
    perApur: per,
    dtIni: `${year}-${String(m0 + 1).padStart(2, '0')}-01`,
    dtFin: `${year}-${String(mEnd + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    from: new Date(Date.UTC(year, m0, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, mEnd, endDay, 23, 59, 59, 999)),
  });
  return [q('T01', 0, 2, 31), q('T02', 3, 5, 30), q('T03', 6, 8, 30), q('T04', 9, 11, 31)];
}

/**
 * SPED ECF (SPED Fiscal · IRPJ/CSLL · Lucro Presumido) file generation
 * (ADR-INCR-SPED-ECF, FASE 2). READ-ONLY over the ledger + ONE metadata write
 * (the export job): NO Posting/JournalEntry write, no period gate (D8).
 *
 * ── O que este serviço faz (e NÃO faz) — ADR §Emenda FASE 2 (pontos 5-6) ──
 * O PVA-ECF computa toda a presunção e o imposto (linhas CNA/CA da tabela
 * dinâmica). Este serviço apenas: (1) segrega a RECEITA BRUTA por atividade
 * (3.1 serviço, 3.3 revenda) por TRIMESTRE via `groupByAccount` e a emite nas
 * linhas `E` de P200/P400; (2) emite o Bloco 0 (identificação + parâmetros
 * fiscais Presumido) e os marcadores de bloco vazios (C/E/J/K/… recuperados/
 * calculados pelo PVA da ECD). NÃO computa base/IRPJ/adicional/CSLL.
 *
 * Gate (D6 corrigido): NÃO há coverage-gate referencial. O gate é EXAUSTIVIDADE
 * DA RECEITA — toda conta natureza `Revenue` com movimento no ano tem de ser
 * 3.1 ou 3.3; qualquer outra ⇒ ValidationError com a lista (guard da lição
 * FAIL-1 do PR#66: receita não-mapeada que some da base = subtributação).
 *
 * Persiste o `.txt` (ISO-8859-1) via o store de disco reusado e grava um EXPORT
 * job + `sped.ecf_generated` audit numa tx (espelha SpedGenerationService/ECD).
 * Residual honesto (ADR §7): import PVA-clean = sign-off humano (validador RFB).
 */
export class SpedEcfGenerationService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly policy: IAccountingPolicy,
    private readonly repo: IDataExchangeRepository,
    private readonly audit: AuditService,
  ) {}

  public async generate(scope: AccountingScope, dto: SpedEcfRequestDto): Promise<DataExchangeJobResponse> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a gerar a ECF.');
    }

    const { year } = dto;
    const windows = quarterWindows(year);

    const accounts = await this.accountRepo.findManyByUnit(scope);
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));

    // Movimento anual por conta (uma leitura) — base do gate de exaustividade.
    const yearFrom = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const yearTo = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const yearTotals = await this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, {
      from: yearFrom,
      to: yearTo,
    });
    const movedById = new Map(yearTotals.map((t) => [t.accountId, t.creditCents - t.debitCents]));

    // ── Gate de exaustividade da receita (D6 corrigido) ──
    // Conta natureza Revenue, analítica, com movimento no ano e código ∉ {3.1, 3.3}
    // ⇒ sua receita escaparia da base presumida. Falha ALTO (nunca drop silencioso).
    const unmapped = accounts
      .filter(
        (a) =>
          a.nature === 'Revenue' &&
          a.acceptsEntries &&
          !PRESUNCAO_ACCOUNT_CODES.has(a.code) &&
          (movedById.get(a.id) ?? 0) !== 0,
      )
      .map((a) => ({ code: a.code, name: a.name }));
    if (unmapped.length > 0) {
      throw new ValidationError(
        'Receita não segregável por atividade: contas de receita sem linha de presunção (3.1 serviço / 3.3 revenda). ' +
          'Reclassifique-as ou estenda o mapa de presunção antes de gerar a ECF.',
        { unmappedRevenueAccounts: unmapped },
      );
    }

    // ── Receita bruta segregada por trimestre ──
    const servico = accountByCode.get(SERVICO_ACCOUNT_CODE);
    const revenda = accountByCode.get(REVENDA_ACCOUNT_CODE);
    const quarters: EcfQuarter[] = [];
    for (const w of windows) {
      const totals = await this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, {
        from: w.from,
        to: w.to,
      });
      const byId = new Map(totals.map((t) => [t.accountId, t.creditCents - t.debitCents]));
      // Receita bruta = crédito líquido (devoluções/descontos entram como débito). ≥ 0.
      const servicoCents = servico ? Math.max(0, byId.get(servico.id) ?? 0) : 0;
      const revendaCents = revenda ? Math.max(0, byId.get(revenda.id) ?? 0) : 0;
      quarters.push({ perApur: w.perApur, dtIni: w.dtIni, dtFin: w.dtFin, servicoCents, revendaCents });
    }

    const input: EcfFileInput = {
      declarant: {
        cnpj: dto.declarant.cnpj,
        nome: dto.declarant.nome,
        dtIni: `${year}-01-01`,
        dtFin: `${year}-12-31`,
        codNat: dto.declarant.codNat,
        cnaeFiscal: dto.declarant.cnaeFiscal,
        endereco: dto.declarant.endereco,
        num: dto.declarant.num,
        compl: dto.declarant.compl,
        bairro: dto.declarant.bairro,
        uf: dto.declarant.uf,
        codMun: dto.declarant.codMun,
        cep: dto.declarant.cep,
        numTel: dto.declarant.numTel,
        email: dto.declarant.email,
      },
      fiscal: { indRecReceita: dto.fiscal.indRecReceita },
      params: { indAliqCsll: dto.fiscal.indAliqCsll },
      signers: dto.signers.map((s) => ({
        identNom: s.identNom,
        identCpfCnpj: s.identCpfCnpj,
        identQualif: s.identQualif,
        indCrc: s.indCrc,
        email: s.email,
        fone: s.fone,
      })),
      quarters,
    };

    const lines = buildEcfFile(input);
    const text = serializeEcf(lines);
    const buffer = Buffer.from(text, 'latin1'); // ISO-8859-1 (ECF-6, Manual p. 31)
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const fileName = `ecf_${dto.declarant.cnpj}_${year}.txt`;

    const job = await this.repo.createJob({
      userId: scope.ownerUserId,
      unitId: scope.unitId,
      direction: 'EXPORT',
      kind: 'EXPORT_SPED_ECF',
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
        eventType: 'sped.ecf_generated',
        targetType: 'data_exchange_job',
        targetId: job.id,
        payload: {
          jobId: job.id,
          kind: 'EXPORT_SPED_ECF',
          year: String(year),
          sha256,
          lineCount: String(lines.length),
        },
      });
      return j;
    });

    return toJobResponse(updated);
  }
}
