import { isValidDateOnly } from '../features/accounting/models/dates';

/**
 * Pure serializer for the SPED Contábil (ECD) text file (ADR-INCR-SPED-ECD).
 * Mirrors the pure-lib pattern of `ofx.ts`/`cnab` — no model, no I/O, no Prisma —
 * so the format-critical logic (the money, date and determinism class-bugs) is
 * fully unit-testable in isolation. The `SpedGenerationService` composes the
 * ledger data and calls the builders here; it carries NO layout knowledge (D2).
 *
 * Normative source: Manual de Orientação do Leiaute 9 da ECD — Anexo ao ADE
 * Cofis nº 01/2026 (janeiro/2026, 235 p.). Every register builder cites the
 * manual page(s) its field order/obligatoriety was transcribed from (PVA-2);
 * nothing here is invented from memory.
 *
 * File constraints from the manual (p. 62-63, PVA-7): charset ISO-8859-1
 * (Latin-1), one record per line, each record terminated by CRLF. Money is a
 * comma-decimal with NO thousands separator and NO sign (float is explicitly
 * rejected). Dates are `ddmmaaaa` with no separators.
 *
 * ECD line format (all registers): pipe-delimited, the line STARTS and ENDS with
 * `|`:  `|REG|campo2|campo3|...|`. An empty field is an empty string between two
 * pipes (`||`), e.g. `|I051||1.01.01.00|`.
 */

// ─── Primitives (Passo 2, verified 13/13) ───────────────────────────────────

/**
 * Assemble one SPED record line from its already-formatted fields (the first
 * MUST be the register code, e.g. "I150"). Returns `|f0|f1|...|` — leading and
 * trailing pipe included. Fields are emitted verbatim: callers format money via
 * `centsToSpedDecimal`, dates via `spedDate`, and pass "" for an empty field.
 *
 * A `|` inside a field would corrupt the record; the manual forbids the pipe as
 * data, so we reject it loudly rather than silently produce an unparseable file.
 */
export function spedLine(fields: string[]): string {
  for (const f of fields) {
    if (f.includes('|')) {
      throw new Error(`Campo SPED não pode conter '|': ${JSON.stringify(f)}`);
    }
  }
  return `|${fields.join('|')}|`;
}

/**
 * Integer cents -> SPED decimal string: UNSIGNED magnitude, 2 decimals, comma
 * separator, NO thousands separator. e.g. 123456 -> "1234,56"; -5 -> "0,05";
 * 0 -> "0,00".
 *
 * The SIGN is NEVER in the value field — SPED carries it in a separate D/C
 * indicator column (see `dcIndicator`). Derived by integer divmod on the
 * absolute value: NEVER `(cents/100).toFixed(2)` (float drift on large values,
 * ACC-014/T4) and never a locale formatter (would inject a '.' thousands
 * separator the PGE rejects).
 */
export function centsToSpedDecimal(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Valor em centavos deve ser inteiro: ${cents}`);
  }
  const abs = Math.abs(cents);
  const inteiro = Math.trunc(abs / 100);
  const centavos = abs % 100;
  return `${inteiro},${String(centavos).padStart(2, '0')}`;
}

/**
 * Debit/credit indicator for a SIGNED balance in cents. Convention: a debit
 * balance (saldo devedor, debit >= credit) is "D", a credit balance is "C".
 * `balanceCents = debit - credit`, so >= 0 -> "D", < 0 -> "C".
 *
 * A zero balance maps to "D". The manual (I155 obs., p. 133; PVA-3 resolved)
 * requires IND_DC on a zero balance to be "D" OR "C" — never blank — so "D" is a
 * valid choice for zero. Callers that need the account's natural side for a zero
 * balance pass the signed value that encodes it.
 */
export function dcIndicator(balanceCents: number): 'D' | 'C' {
  return balanceCents < 0 ? 'C' : 'D';
}

/**
 * Date-only ISO (`YYYY-MM-DD`) -> SPED date (`DDMMYYYY`, no separators) by
 * LITERAL slice of the string parts. NEVER `new Date(iso)` then read
 * getDate()/format: that is the UTC-shift class-bug (a America/Sao_Paulo
 * `-03:00` offset rolls the calendar day back). Validates the calendar via the
 * shared `isValidDateOnly` (round-trip) first.
 */
export function spedDate(iso: string): string {
  if (!isValidDateOnly(iso)) {
    throw new Error(`Data inválida para SPED (esperado YYYY-MM-DD real): ${iso}`);
  }
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

/**
 * Bloco 9 counters + file total. Given every emitted line (each already a
 * `|REG|...|` string, in file order), produce:
 *   - `byRegister`: Map REG -> occurrence count, for the 9900 records
 *     (`|9900|REG|QTD|`). Per the manual (p. 230, PVA-6), 9900 has one line PER
 *     register type PRESENT in the file, and MUST also count 9900 itself, 9990
 *     and 9999 (self-reference).
 *   - `total`: the grand total of lines for `|9999|QTD_LIN|` (includes the 9999
 *     line itself).
 *
 * Pure counting over the already-built lines, so the counts cannot drift from
 * what is actually written — the source of truth is the line array itself.
 */
export function countRegisters(lines: string[]): { byRegister: Map<string, number>; total: number } {
  const byRegister = new Map<string, number>();
  for (const line of lines) {
    const reg = line.split('|')[1] ?? '';
    byRegister.set(reg, (byRegister.get(reg) ?? 0) + 1);
  }
  return { byRegister, total: lines.length };
}

// ─── Passo 2b: register builders (Leiaute 9, field-by-field) ─────────────────
//
// Each builder takes a typed value object and returns the assembled record line.
// Money is passed as integer cents (formatted via centsToSpedDecimal); dates as
// YYYY-MM-DD ISO (formatted via spedDate). SPED-specific enums (codNat, indCta,
// indGrpBal, indCodAgl, D/C) are passed already resolved so the serializer stays
// pure and carries no domain-classification logic (D2).

const EMPTY = '';
/** Layout version code for I010.COD_VER_LC — Leiaute 9 (manual capa / p. 108). */
export const SPED_LAYOUT_VERSION = '9.00';

/** Block-opening register (0001/I001/J001/9001): REG + IND_DAD. IND_DAD "0" =
 * bloco COM dados (MVP always has data). Manual pp. 108 (I001), 169 (J001),
 * 229 (9001). */
export function buildBlockOpen(reg: '0001' | 'I001' | 'J001' | '9001'): string {
  return spedLine([reg, '0']);
}

/** Block-closing register (0990/I990/J990/9990): REG + QTD_LIN (lines in the
 * block, counting the closer itself). Manual pp. 168 (I990), 231 (9990). */
export function buildBlockClose(
  reg: '0990' | 'I990' | 'J990' | '9990',
  qtdLinBloco: number,
): string {
  return spedLine([reg, String(qtdLinBloco)]);
}

// ── Bloco 0 ──

export interface Reg0000Input {
  dtIni: string; // ISO YYYY-MM-DD
  dtFin: string;
  nome: string;
  cnpj: string;
  uf: string;
  ie?: string;
  codMun: string;
  im?: string;
  indSitEsp?: string; // situação especial (1..4) — vazio no caso normal
  indSitIniPer: string; // situação no início do período (tabela p. 65)
  indNire: string; // 0=sem NIRE, 1=com NIRE
  indFinEsc: string; // 0=Original, 1=Substituta
  codHashSub?: string; // hash da substituída (só quando IND_FIN_ESC=1)
  indGrandePorte: string; // 0/1
  tipEcd: string; // 0/1/2
  codScp?: string; // CNPJ da SCP (só TIP_ECD=2)
  identMf: string; // S/N (MVP: N)
  indEscCons: string; // S/N
  indCentralizada: string; // 0/1
  indMudancPc: string; // 0/1
  codPlanRef?: string; // 1..10 — plano referencial (vazio se não mapeia)
}

/**
 * 0000 — Abertura do arquivo e identificação (23 campos). Manual pp. 64-67.
 * Ordem: REG, LECD, DT_INI, DT_FIN, NOME, CNPJ, UF, IE, COD_MUN, IM,
 * IND_SIT_ESP, IND_SIT_INI_PER, IND_NIRE, IND_FIN_ESC, COD_HASH_SUB,
 * IND_GRANDE_PORTE, TIP_ECD, COD_SCP, IDENT_MF, IND_ESC_CONS, IND_CENTRALIZADA,
 * IND_MUDANC_PC, COD_PLAN_REF.
 */
export function build0000(i: Reg0000Input): string {
  return spedLine([
    '0000',
    'LECD',
    spedDate(i.dtIni),
    spedDate(i.dtFin),
    i.nome,
    i.cnpj,
    i.uf,
    i.ie ?? EMPTY,
    i.codMun,
    i.im ?? EMPTY,
    i.indSitEsp ?? EMPTY,
    i.indSitIniPer,
    i.indNire,
    i.indFinEsc,
    i.codHashSub ?? EMPTY,
    i.indGrandePorte,
    i.tipEcd,
    i.codScp ?? EMPTY,
    i.identMf,
    i.indEscCons,
    i.indCentralizada,
    i.indMudancPc,
    i.codPlanRef ?? EMPTY,
  ]);
}

/** 0007 — Outras inscrições cadastrais (condicional). REG, COD_ENT, COD_INSCR.
 * Manual p. 68. Emitido só quando o declarante traz inscrições extras. */
export interface Reg0007Input {
  codEnt: string;
  codInscr: string;
}
export function build0007(i: Reg0007Input): string {
  return spedLine(['0007', i.codEnt, i.codInscr]);
}

// ── Bloco I ──

/** I010 — Identificação da escrituração (3 campos). REG, IND_ESC, COD_VER_LC.
 * Manual p. 108. IND_ESC='G' (Diário Geral), COD_VER_LC=9.00 (Leiaute 9). */
export function buildI010(indEsc: string, codVerLc: string = SPED_LAYOUT_VERSION): string {
  return spedLine(['I010', indEsc, codVerLc]);
}

export interface RegI030Input {
  numOrd: string; // número de ordem do livro
  natLivr: string; // natureza do livro (== J900.NAT_LIVRO)
  qtdLin: number; // total de linhas do arquivo (== 9999) — resolvido em 2ª passada
  nome: string; // == 0000.NOME
  nire?: string;
  cnpj: string; // == 0000.CNPJ
  dtArq?: string; // ISO — data de arquivamento
  dtArqConv?: string; // ISO
  descMun?: string;
  dtExSocial: string; // ISO — encerramento do exercício social
}

/**
 * I030 — Termo de abertura (12 campos). Manual pp. 113-114. Ordem: REG,
 * DNRC_ABERT("TERMO DE ABERTURA"), NUM_ORD, NAT_LIVR, QTD_LIN, NOME, NIRE, CNPJ,
 * DT_ARQ, DT_ARQ_CONV, DESC_MUN, DT_EX_SOCIAL. QTD_LIN é o total do arquivo
 * (REGRA_IGUAL_QTD_LIN_REG9999) — preenchido na 2ª passada.
 */
export function buildI030(i: RegI030Input): string {
  return spedLine([
    'I030',
    'TERMO DE ABERTURA',
    i.numOrd,
    i.natLivr,
    String(i.qtdLin),
    i.nome,
    i.nire ?? EMPTY,
    i.cnpj,
    i.dtArq ? spedDate(i.dtArq) : EMPTY,
    i.dtArqConv ? spedDate(i.dtArqConv) : EMPTY,
    i.descMun ?? EMPTY,
    spedDate(i.dtExSocial),
  ]);
}

export interface RegI050Input {
  dtAlt: string; // ISO — data de inclusão/alteração
  codNat: string; // 01 Ativo,02 Passivo,03 PL,04 Resultado,05 Compensação,09 Outras
  indCta: 'S' | 'A'; // Sintética / Analítica
  nivel: number;
  codCta: string;
  codCtaSup?: string;
  cta: string; // nome da conta
}

/**
 * I050 — Plano de contas (8 campos). Manual pp. 117-118. Ordem: REG, DT_ALT,
 * COD_NAT, IND_CTA, NIVEL, COD_CTA, COD_CTA_SUP, CTA. COD_NAT e IND_CTA já vêm
 * resolvidos (mapeamento domínio→tabela SPED fica no service).
 */
export function buildI050(i: RegI050Input): string {
  return spedLine([
    'I050',
    spedDate(i.dtAlt),
    i.codNat,
    i.indCta,
    String(i.nivel),
    i.codCta,
    i.codCtaSup ?? EMPTY,
    i.cta,
  ]);
}

/** I051 — Plano de contas referencial (3 campos). REG, COD_CCUS, COD_CTA_REF.
 * Manual pp. 122-123 (exemplo `|I051||11100009|`, sem COD_ENT_REF — PVA-4).
 * Filho de I050; só para conta analítica. COD_CCUS vazio no MVP. */
export function buildI051(codCtaRef: string, codCcus: string = EMPTY): string {
  return spedLine(['I051', codCcus, codCtaRef]);
}

/** I052 — Indicação dos códigos de aglutinação (3 campos). REG, COD_CCUS,
 * COD_AGL. Manual p. 124. Filho de I050; só para conta analítica. Liga a conta
 * ao código de aglutinação das demonstrações do bloco J (REGRA_OBRIGATORIO_I052
 * do J100/J150). COD_CCUS vazio no MVP. */
export function buildI052(codAgl: string, codCcus: string = EMPTY): string {
  return spedLine(['I052', codCcus, codAgl]);
}

/** I150 — Saldos periódicos, identificação do período (3 campos). REG, DT_INI,
 * DT_FIN. Manual pp. 131-132. MENSAL (D11): DT_INI=1º dia, DT_FIN=último dia do
 * mês. Exemplo `|I150|01012023|31012023|`. */
export function buildI150(dtIni: string, dtFin: string): string {
  return spedLine(['I150', spedDate(dtIni), spedDate(dtFin)]);
}

export interface RegI155Input {
  codCta: string;
  codCcus?: string;
  saldoIniCents: number; // signed (debit - credit)
  debitCents: number; // magnitude do total de débitos do mês
  creditCents: number; // magnitude do total de créditos do mês
  saldoFinCents: number; // signed
}

/**
 * I155 — Detalhe dos saldos periódicos (9 campos MVP). Manual pp. 132-133.
 * Ordem: REG, COD_CTA, COD_CCUS, VL_SLD_INI, IND_DC_INI, VL_DEB, VL_CRED,
 * VL_SLD_FIN, IND_DC_FIN. Campos 10-15 (moeda funcional) só quando 0000.IDENT_MF
 * ='S' — fora do MVP. Saldo zero: valor "0,00", IND_DC nunca vazio (PVA-3).
 */
export function buildI155(i: RegI155Input): string {
  return spedLine([
    'I155',
    i.codCta,
    i.codCcus ?? EMPTY,
    centsToSpedDecimal(i.saldoIniCents),
    dcIndicator(i.saldoIniCents),
    centsToSpedDecimal(i.debitCents),
    centsToSpedDecimal(i.creditCents),
    centsToSpedDecimal(i.saldoFinCents),
    dcIndicator(i.saldoFinCents),
  ]);
}

export interface RegI200Input {
  numLcto: string;
  dtLcto: string; // ISO
  vlLctoCents: number; // magnitude (soma das partidas de mesmo indicador)
  indLcto?: 'N' | 'E' | 'X'; // MVP: N (normal)
  dtLctoExt?: string; // ISO (só extemporâneo)
}

/**
 * I200 — Lançamento contábil (6 campos MVP). Manual pp. 142-143. Ordem: REG,
 * NUM_LCTO, DT_LCTO, VL_LCTO, IND_LCTO, DT_LCTO_EXT. Campo 07 (VL_LCTO_MF) só com
 * moeda funcional. IND_LCTO: 'E' para lançamento de encerramento das contas de resultado
 * (derivado de sourceType='closing'), 'N' para os demais (BE-INCR-SPED-APURACAO).
 */
export function buildI200(i: RegI200Input): string {
  return spedLine([
    'I200',
    i.numLcto,
    spedDate(i.dtLcto),
    centsToSpedDecimal(i.vlLctoCents),
    i.indLcto ?? 'N',
    i.dtLctoExt ? spedDate(i.dtLctoExt) : EMPTY,
  ]);
}

export interface RegI250Input {
  codCta: string;
  codCcus?: string;
  vlCents: number; // magnitude da partida
  indDc: 'D' | 'C';
  hist: string; // histórico da partida (REGRA_HISTORICO_OBRIGATORIO)
  numArq?: string;
  codHistPad?: string;
  codPart?: string;
}

/**
 * I250 — Partidas do lançamento (9 campos MVP). Manual pp. 147-148. Ordem: REG,
 * COD_CTA, COD_CCUS, VL_DC, IND_DC, NUM_ARQ, COD_HIST_PAD, HIST, COD_PART. Campos
 * 10-11 (moeda funcional) fora do MVP. COD_PART evitado (não referenciar 0150).
 */
export function buildI250(i: RegI250Input): string {
  return spedLine([
    'I250',
    i.codCta,
    i.codCcus ?? EMPTY,
    centsToSpedDecimal(i.vlCents),
    i.indDc,
    i.numArq ?? EMPTY,
    i.codHistPad ?? EMPTY,
    i.hist,
    i.codPart ?? EMPTY,
  ]);
}

/** I350 — Saldos das contas de resultado antes do encerramento, identificação da data
 * (2 campos). REG, DT_RES. Manual pp. 155-156. DT_RES = data da apuração do resultado, tem
 * de `== I030.DT_EX_SOCIAL` (31/12) e estar em `[0000.DT_INI, DT_FIN]`
 * (REGRA_ENCERRAMENTO_EXERCICIO / REGRA_DATA_INTERVALO_DO_ARQUIVO). Exemplo `|I350|31032023|`. */
export function buildI350(dtRes: string): string {
  return spedLine(['I350', spedDate(dtRes)]);
}

export interface RegI355Input {
  codCta: string;
  codCcus?: string;
  saldoCents: number; // signed (debit − credit) do saldo ANTES do encerramento
}

/**
 * I355 — Detalhes dos saldos das contas de resultado antes do encerramento (5 campos MVP).
 * Manual pp. 157-158. Ordem: REG, COD_CTA, COD_CCUS, VL_CTA, IND_DC. Campos 06-07 (moeda
 * funcional) só com 0000.IDENT_MF='S' — fora do MVP. VL_CTA = magnitude sem sinal; IND_DC = D
 * (devedor, saldo≥0) / C (credor, saldo<0). Filho do I350; só conta analítica de resultado
 * (COD_NAT='04'). O saldo é o MESMO que a soma das partidas de encerramento (IND_LCTO='E') com
 * D/C invertido (REGRA_VALIDACAO_SALDO_CONTA) — cai por construção.
 */
export function buildI355(i: RegI355Input): string {
  return spedLine([
    'I355',
    i.codCta,
    i.codCcus ?? EMPTY,
    centsToSpedDecimal(i.saldoCents),
    dcIndicator(i.saldoCents),
  ]);
}

// ── Bloco J ──

export interface RegJ005Input {
  dtIni: string; // ISO
  dtFin: string; // ISO (== fim do exercício)
  idDem?: '1' | '2'; // MVP: 1 (PJ própria)
  cabDem?: string; // só quando ID_DEM=2
}

/** J005 — Demonstrações contábeis (5 campos). Manual pp. 171-172. Ordem: REG,
 * DT_INI, DT_FIN, ID_DEM, CAB_DEM. ID_DEM='1', CAB_DEM vazio no MVP. */
export function buildJ005(i: RegJ005Input): string {
  return spedLine([
    'J005',
    spedDate(i.dtIni),
    spedDate(i.dtFin),
    i.idDem ?? '1',
    i.cabDem ?? EMPTY,
  ]);
}

export interface RegJ100Line {
  codAgl: string;
  indCodAgl: 'T' | 'D'; // Totalizador / Detalhe
  nivelAgl: number;
  codAglSup?: string;
  indGrpBal: 'A' | 'P'; // Ativo / Passivo+PL
  descr: string;
  vlIniCents: number; // signed
  vlFinCents: number; // signed
  notaExpRef?: string;
}

/**
 * J100 — Balanço Patrimonial (12 campos). Manual pp. 174-176. Ordem: REG,
 * COD_AGL, IND_COD_AGL, NIVEL_AGL, COD_AGL_SUP, IND_GRP_BAL, DESCR_COD_AGL,
 * VL_CTA_INI, IND_DC_CTA_INI, VL_CTA_FIN, IND_DC_CTA_FIN, NOTA_EXP_REF.
 */
export function buildJ100(l: RegJ100Line): string {
  return spedLine([
    'J100',
    l.codAgl,
    l.indCodAgl,
    String(l.nivelAgl),
    l.codAglSup ?? EMPTY,
    l.indGrpBal,
    l.descr,
    centsToSpedDecimal(l.vlIniCents),
    dcIndicator(l.vlIniCents),
    centsToSpedDecimal(l.vlFinCents),
    dcIndicator(l.vlFinCents),
    l.notaExpRef ?? EMPTY,
  ]);
}

export interface RegJ150Line {
  nuOrdem: number;
  codAgl: string;
  indCodAgl: 'T' | 'D';
  nivelAgl: number;
  codAglSup?: string;
  descr: string;
  vlIniCents: number; // signed
  vlFinCents: number; // signed
  indGrpDre: 'D' | 'R'; // Despesa(redução) / Receita(incremento)
  notaExpRef?: string;
}

/**
 * J150 — Demonstração do Resultado do Exercício (13 campos). Manual pp. 180-182.
 * Ordem: REG, NU_ORDEM, COD_AGL, IND_COD_AGL, NIVEL_AGL, COD_AGL_SUP,
 * DESCR_COD_AGL, VL_CTA_INI, IND_DC_CTA_INI, VL_CTA_FIN, IND_DC_CTA_FIN,
 * IND_GRP_DRE, NOTA_EXP_REF. (Difere do J100: tem NU_ORDEM e IND_GRP_DRE.)
 */
export function buildJ150(l: RegJ150Line): string {
  return spedLine([
    'J150',
    String(l.nuOrdem),
    l.codAgl,
    l.indCodAgl,
    String(l.nivelAgl),
    l.codAglSup ?? EMPTY,
    l.descr,
    centsToSpedDecimal(l.vlIniCents),
    dcIndicator(l.vlIniCents),
    centsToSpedDecimal(l.vlFinCents),
    dcIndicator(l.vlFinCents),
    l.indGrpDre,
    l.notaExpRef ?? EMPTY,
  ]);
}

export interface RegJ900Input {
  numOrd: string; // == I030.NUM_ORD
  natLivro: string; // == I030.NAT_LIVR
  nome: string; // == 0000.NOME
  qtdLin: number; // total de linhas do arquivo (== 9999) — 2ª passada
  dtIniEscr: string; // ISO (== 0000.DT_INI)
  dtFinEscr: string; // ISO (== 0000.DT_FIN)
}

/**
 * J900 — Termo de encerramento (8 campos). Manual pp. 195-196. Ordem: REG,
 * DNRC_ENCER("TERMO DE ENCERRAMENTO"), NUM_ORD, NAT_LIVRO, NOME, QTD_LIN,
 * DT_INI_ESCR, DT_FIN_ESCR. Exemplo `|J900|TERMO DE ENCERRAMENTO|100|DIÁRIO
 * GERAL|EMPRESA TESTE|500|01012023|31012023|`.
 */
export function buildJ900(i: RegJ900Input): string {
  return spedLine([
    'J900',
    'TERMO DE ENCERRAMENTO',
    i.numOrd,
    i.natLivro,
    i.nome,
    String(i.qtdLin),
    spedDate(i.dtIniEscr),
    spedDate(i.dtFinEscr),
  ]);
}

export interface RegJ930Signer {
  identNom: string; // nome
  identCpfCnpj: string; // CPF ou CNPJ
  identQualif: string; // descrição da qualificação (campo 04)
  codAssin: string; // código de qualificação (campo 05; 900=Contador)
  indCrc?: string; // nº CRC (obrigatório se codAssin=900)
  email?: string;
  fone?: string;
  ufCrc?: string;
  numSeqCrc?: string;
  dtCrc?: string; // ISO
  indRespLegal: 'S' | 'N';
}

/**
 * J930 — Signatários da escrituração (12 campos). Manual pp. 199-201. Ordem:
 * REG, IDENT_NOM, IDENT_CPF_CNPJ, IDENT_QUALIF, COD_ASSIN, IND_CRC, EMAIL, FONE,
 * UF_CRC, NUM_SEQ_CRC, DT_CRC, IND_RESP_LEGAL. Os códigos QUALIF (PVA-5) são
 * input validado por shape (vêm do DTO), não tabela hardcoded.
 */
export function buildJ930(s: RegJ930Signer): string {
  return spedLine([
    'J930',
    s.identNom,
    s.identCpfCnpj,
    s.identQualif,
    s.codAssin,
    s.indCrc ?? EMPTY,
    s.email ?? EMPTY,
    s.fone ?? EMPTY,
    s.ufCrc ?? EMPTY,
    s.numSeqCrc ?? EMPTY,
    s.dtCrc ? spedDate(s.dtCrc) : EMPTY,
    s.indRespLegal,
  ]);
}

// ─── File assembler (block ordering + two-pass counters) ─────────────────────

/** CRLF terminator per record (manual p. 63, PVA-7). */
export const SPED_LINE_TERMINATOR = '\r\n';

/**
 * Join record lines into the final ECD text. Each record is terminated by CRLF,
 * INCLUDING the last (SPED files end with a trailing CRLF). The service writes
 * the returned string as ISO-8859-1 (Latin-1) bytes.
 */
export function serializeEcd(lines: string[]): string {
  return lines.map((l) => l + SPED_LINE_TERMINATOR).join('');
}

export interface EcdI050Node {
  account: RegI050Input;
  /** COD_CTA_REF (I051) — presente só p/ conta analítica mapeada. */
  refCode?: string;
  /** COD_AGL (I052) — presente só p/ conta analítica (aglutinação bloco J). */
  aglCode?: string;
}

export interface EcdMonth {
  dtIni: string; // ISO — 1º dia do mês
  dtFin: string; // ISO — último dia do mês
  saldos: RegI155Input[];
}

export interface EcdEntry {
  entry: RegI200Input;
  legs: RegI250Input[];
}

export interface EcdFileInput {
  declarant: Reg0000Input;
  extraInscriptions?: Reg0007Input[];
  indEsc: string; // I010 (G)
  book: {
    numOrd: string;
    natLivr: string;
    nire?: string;
    dtArq?: string;
    dtArqConv?: string;
    descMun?: string;
    dtExSocial: string; // ISO
  };
  accounts: EcdI050Node[]; // já ordenadas por code (determinismo)
  months: EcdMonth[]; // 12 no ano cheio (D11)
  entries: EcdEntry[]; // já ordenados por date+entryNumber (determinismo)
  /**
   * Saldos das contas de resultado ANTES do encerramento (I350 + I355). Presente SÓ quando o
   * exercício está encerrado (há lançamento de encerramento) — BE-INCR-SPED-APURACAO. Ausente ⇒
   * I350/I355 não emitidos (exercício não-encerrado; a ECD mantém o resíduo de valor do bloco J).
   */
  resultClosing?: { dtRes: string; saldos: RegI355Input[] };
  balanceSheet: RegJ100Line[];
  incomeStatement: RegJ150Line[];
  signers: RegJ930Signer[];
}

const TOTAL_PLACEHOLDER = -1;

/**
 * Assemble the complete ECD file (all MVP blocks in order) and resolve the
 * counter fields in a deterministic second pass:
 *   - block closers (0990/I990/J990/9990) = lines in each block (self-inclusive);
 *   - 9900 = one line per register type present, self-referential (PVA-6);
 *   - grand total (I030.QTD_LIN, J900.QTD_LIN, 9999) = total lines in the file.
 *
 * Returns the ordered line array; join via `serializeEcd`. Determinism: given
 * the same (already-sorted) input, the output is byte-identical (D8) — the sha256
 * test pins this.
 */
export function buildEcdFile(input: EcdFileInput): string[] {
  const i030Base = {
    numOrd: input.book.numOrd,
    natLivr: input.book.natLivr,
    nome: input.declarant.nome,
    nire: input.book.nire,
    cnpj: input.declarant.cnpj,
    dtArq: input.book.dtArq,
    dtArqConv: input.book.dtArqConv,
    descMun: input.book.descMun,
    dtExSocial: input.book.dtExSocial,
  };
  const j900Base = {
    numOrd: input.book.numOrd,
    natLivro: input.book.natLivr,
    nome: input.declarant.nome,
    dtIniEscr: input.declarant.dtIni,
    dtFinEscr: input.declarant.dtFin,
  };

  // ── Bloco 0 ──
  const block0: string[] = [];
  block0.push(build0000(input.declarant));
  block0.push(buildBlockOpen('0001'));
  for (const ins of input.extraInscriptions ?? []) block0.push(build0007(ins));
  block0.push(EMPTY); // slot do 0990
  block0[block0.length - 1] = buildBlockClose('0990', block0.length);

  // ── Bloco I ──
  const blockI: string[] = [];
  blockI.push(buildBlockOpen('I001'));
  blockI.push(buildI010(input.indEsc));
  blockI.push(buildI030({ ...i030Base, qtdLin: TOTAL_PLACEHOLDER }));
  const i030Index = blockI.length - 1;
  // Plano de contas: I050 + (I051 referencial) + (I052 aglutinação) por conta analítica.
  for (const node of input.accounts) {
    blockI.push(buildI050(node.account));
    if (node.account.indCta === 'A') {
      if (node.refCode) blockI.push(buildI051(node.refCode));
      if (node.aglCode) blockI.push(buildI052(node.aglCode));
    }
  }
  // Saldos periódicos mensais (D11): I150 + I155.
  for (const m of input.months) {
    blockI.push(buildI150(m.dtIni, m.dtFin));
    for (const s of m.saldos) blockI.push(buildI155(s));
  }
  // Diário (I200 + I250).
  for (const e of input.entries) {
    blockI.push(buildI200(e.entry));
    for (const leg of e.legs) blockI.push(buildI250(leg));
  }
  // Saldos das contas de resultado antes do encerramento (I350 + I355), após o diário e antes
  // do I990 — só quando o exercício está encerrado (BE-INCR-SPED-APURACAO).
  if (input.resultClosing) {
    blockI.push(buildI350(input.resultClosing.dtRes));
    for (const s of input.resultClosing.saldos) blockI.push(buildI355(s));
  }
  blockI.push(EMPTY); // slot do I990
  blockI[blockI.length - 1] = buildBlockClose('I990', blockI.length);

  // ── Bloco J ──
  const blockJ: string[] = [];
  blockJ.push(buildBlockOpen('J001'));
  blockJ.push(buildJ005({ dtIni: input.declarant.dtIni, dtFin: input.declarant.dtFin }));
  for (const l of input.balanceSheet) blockJ.push(buildJ100(l));
  for (const l of input.incomeStatement) blockJ.push(buildJ150(l));
  blockJ.push(buildJ900({ ...j900Base, qtdLin: TOTAL_PLACEHOLDER }));
  const j900Index = blockJ.length - 1;
  for (const s of input.signers) blockJ.push(buildJ930(s));
  blockJ.push(EMPTY); // slot do J990
  blockJ[blockJ.length - 1] = buildBlockClose('J990', blockJ.length);

  // ── Bloco 9 (contagem) ──
  const preceding = [...block0, ...blockI, ...blockJ];
  const nine001 = buildBlockOpen('9001');
  const counts = new Map<string, number>();
  for (const line of [...preceding, nine001]) {
    const reg = line.split('|')[1] ?? '';
    counts.set(reg, (counts.get(reg) ?? 0) + 1);
  }
  // Tipos presentes no arquivo final = os já contados + os que o bloco 9 cria.
  const types = new Set<string>([...counts.keys(), '9900', '9990', '9999']);
  counts.set('9900', types.size); // uma linha 9900 por tipo (auto-referência)
  counts.set('9990', 1);
  counts.set('9999', 1);
  const nine900 = [...types].sort().map((t) => spedLine(['9900', t, String(counts.get(t) ?? 0)]));
  const block9WithoutClosers = [nine001, ...nine900];
  const block9Total = block9WithoutClosers.length + 2; // + 9990 + 9999
  const nine990 = buildBlockClose('9990', block9Total);
  const block9: string[] = [...block9WithoutClosers, nine990]; // 9999 abaixo

  // ── Total geral (2ª passada) ──
  const grandTotal = preceding.length + block9.length + 1; // +1 = a própria 9999
  block9.push(spedLine(['9999', String(grandTotal)]));

  // Patch dos campos QTD_LIN = total do arquivo (I030, J900; 9999 já feito).
  blockI[i030Index] = buildI030({ ...i030Base, qtdLin: grandTotal });
  blockJ[j900Index] = buildJ900({ ...j900Base, qtdLin: grandTotal });

  return [...block0, ...blockI, ...blockJ, ...block9];
}

/**
 * Runnable self-check (ponytail: the money/date/determinism logic leaves one
 * check that fails if it breaks). Not a test framework — asserts + throws.
 */
export function __selfCheck(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`sped selfCheck: ${msg}`);
  };
  assert(centsToSpedDecimal(123456) === '1234,56', 'cents 123456');
  assert(centsToSpedDecimal(-5) === '0,05', 'cents -5 magnitude');
  assert(centsToSpedDecimal(0) === '0,00', 'cents 0');
  assert(dcIndicator(-1) === 'C' && dcIndicator(0) === 'D' && dcIndicator(1) === 'D', 'dc');
  assert(spedDate('2026-01-01') === '01012026', 'date jan 1');
  assert(spedLine(['I150', '01012026', '31012026']) === '|I150|01012026|31012026|', 'line');
  const { byRegister, total } = countRegisters(['|0000|x|', '|I150|a|', '|I150|b|']);
  assert(byRegister.get('I150') === 2 && total === 3, 'count');
  // I155 zero balance keeps IND_DC (never blank) — PVA-3.
  assert(
    buildI155({ codCta: '1', saldoIniCents: 0, debitCents: 0, creditCents: 0, saldoFinCents: 0 }) ===
      '|I155|1||0,00|D|0,00|0,00|0,00|D|',
    'i155 zero',
  );
  // I350/I355 — encerramento (BE-INCR-SPED-APURACAO). Saldo credor (receita) ⇒ IND_DC=C.
  assert(buildI350('2026-12-31') === '|I350|31122026|', 'i350');
  assert(
    buildI355({ codCta: '3.1', saldoCents: -150000 }) === '|I355|3.1||1500,00|C|',
    'i355 credor',
  );
  assert(
    buildI355({ codCta: '4.1', saldoCents: 90000 }) === '|I355|4.1||900,00|D|',
    'i355 devedor',
  );
}
