import { spedLine, centsToSpedDecimal, spedDate } from './sped';

/**
 * Pure serializer for the SPED Fiscal (ECF) text file — Lucro Presumido MVP
 * (ADR-INCR-SPED-ECF). Mirrors the pure-lib pattern of `sped.ts` (ECD): no model,
 * no I/O, no Prisma. The `SpedEcfGenerationService` composes the ledger data and
 * calls the builders here; this file carries NO tax-computation logic.
 *
 * Normative source: Manual de Orientação do Leiaute 12 da ECF — Anexo ao ADE
 * Cofis nº 02/2026 (julho/2026, 621 p.), ano-calendário 2025. Every register
 * builder cites the manual page its field order was transcribed from
 * (Passo A — `docs/accounting/BE-INCR-SPED-ECF-layout-transcription.md`);
 * nothing here is invented from memory.
 *
 * File constraints (Manual p. 31, ECF-6 — VERIFIED, paridade com a ECD):
 * charset ISO-8859-1 (Latin-1), one record per line terminated by CRLF, pipe
 * delimiter, money as comma-decimal with NO thousands separator and NO sign.
 * The primitives `spedLine`/`centsToSpedDecimal`/`spedDate` are byte-identical to
 * the ECD's, so they are REUSED from `sped.ts` (not re-inlined — the re-inlined-
 * technique anti-pattern). Manual also defines a signed type `NS`, but the ECF
 * lines WE emit are receita-bruta `E`-lines (always ≥ 0), so no signed formatter
 * is needed here — the PVA computes every signed base/tax line (ADR D2, invertido).
 *
 * ── DIVISÃO DE RESPONSABILIDADE (ADR §Emenda FASE 2, pontos 5-6) ──
 * O PVA-ECF computa toda a presunção e o imposto via fórmulas da tabela dinâmica
 * da RFB (linhas CNA/CA de P200/P300/P400/P500). Luminaris só fornece a RECEITA
 * BRUTA SEGREGADA por atividade nas linhas `E`: serviço(3.1)→P200(8)/P400(4);
 * revenda(3.3)→P200(4)/P400(2). Blocos C/E/J/K (e P100/P150) são recuperados/
 * calculados pelo PVA a partir da ECD (0010.TIP_ESC_PRE='C') — nós emitimos só
 * seus marcadores de bloco vazio.
 */

// ─── Constantes de layout ───────────────────────────────────────────────────

/** 0000.NOME_ESC — tipo de escrituração (texto fixo). Manual p. 62. */
export const ECF_TIPO_ESC = 'LECF';
/**
 * 0000.COD_VER — código da versão do leiaute. Leiaute 12 ⇒ '0012'. O exemplo do
 * Manual (p. 67) mostra '0011' (exemplo não atualizado do leiaute anterior — bug
 * conhecido de exemplo). Usamos '0012' (o leiaute corrente); VERIFICAR no
 * PVA-ECF (residual de sign-off humano, ver §Fechamento do ADR).
 */
export const ECF_COD_VER = '0012';

/**
 * Códigos de linha da tabela dinâmica (P200/P400) que recebem a receita bruta
 * segregada por atividade. NÃO são constantes fiscais (as alíquotas moram nas
 * fórmulas do PVA) — é um mapa de LAYOUT `atividade → linha`. Fonte:
 * `Tabelas_Dinamicas_ECF_Leiaute_12`, planilhas P200/P400 (Passo A).
 *   serviço  (conta 3.1): P200(8) "Receita Bruta Sujeita ao Percentual de 32%"
 *                         P400(4) "Receita Bruta Sujeita ao Percentual de 32%"
 *   revenda  (conta 3.3): P200(4) "Receita Bruta Sujeita ao Percentual de 8%"
 *                         P400(2) "Receita Bruta Sujeita ao Percentual de 12%"
 */
export const P_LINE = {
  servico: { p200: '8', p400: '4' },
  revenda: { p200: '4', p400: '2' },
} as const;

const EMPTY = '';

// ─── Abertura/encerramento de bloco (todos os blocos — Manual p. 41) ──────────
//
// "todos os blocos são obrigatórios e o respectivo registro de abertura indicará
// a presença ou a ausência de dados" (Manual p. 41). IND_DAD: '0' bloco com
// dados, '1' bloco sem dados (Manual p. 108, C001 e análogos).

export type BlockOpenReg =
  | '0001' | 'C001' | 'E001' | 'J001' | 'K001' | 'L001' | 'M001' | 'N001'
  | 'P001' | 'Q001' | 'T001' | 'U001' | 'V001' | 'W001' | 'X001' | 'Y001' | '9001';
export type BlockCloseReg =
  | '0990' | 'C990' | 'E990' | 'J990' | 'K990' | 'L990' | 'M990' | 'N990'
  | 'P990' | 'Q990' | 'T990' | 'U990' | 'V990' | 'W990' | 'X990' | 'Y990' | '9990';

/** Abertura de bloco: REG + IND_DAD ('0' com dados / '1' sem dados). */
export function buildBlockOpen(reg: BlockOpenReg, hasData: boolean): string {
  return spedLine([reg, hasData ? '0' : '1']);
}

/** Encerramento de bloco: REG + QTD_LIN (linhas do bloco, incluindo o próprio
 * encerrador). Manual p. 107 (0990), 617 (9990). */
export function buildBlockClose(reg: BlockCloseReg, qtdLin: number): string {
  return spedLine([reg, String(qtdLin)]);
}

// ── Bloco 0 ──

export interface Reg0000Input {
  cnpj: string;
  nome: string;
  dtIni: string; // ISO YYYY-MM-DD
  dtFin: string; // ISO
  indSitIniPer?: string; // '0' Regular (default)
  sitEspecial?: string; // '0' Normal (default)
  retificadora?: string; // 'N' original (default)
  numRec?: string; // hash recibo ECF anterior — vazio p/ original
  tipEcf?: string; // '0' não-SCP (default)
}

/**
 * 0000 — Abertura do arquivo e identificação (15 campos). Manual pp. 61-68.
 * Ordem (exemplo p. 67): REG, NOME_ESC(LECF), COD_VER, CNPJ, NOME,
 * IND_SIT_INI_PER, SIT_ESPECIAL, PAT_REMAN_CIS, DT_SIT_ESP, DT_INI, DT_FIN,
 * RETIFICADORA, NUM_REC, TIP_ECF, COD_SCP. Regras: quando IND_SIT_INI_PER='0'
 * ⇒ DT_INI = 01/01/AAAA; quando SIT_ESPECIAL='0' ⇒ DT_FIN dd/mm = 31/12;
 * NUM_REC vazio quando RETIFICADORA='N'.
 */
export function build0000(i: Reg0000Input): string {
  return spedLine([
    '0000',
    ECF_TIPO_ESC,
    ECF_COD_VER,
    i.cnpj,
    i.nome,
    i.indSitIniPer ?? '0',
    i.sitEspecial ?? '0',
    EMPTY, // PAT_REMAN_CIS
    EMPTY, // DT_SIT_ESP
    spedDate(i.dtIni),
    spedDate(i.dtFin),
    i.retificadora ?? 'N',
    i.numRec ?? EMPTY,
    i.tipEcf ?? '0',
    EMPTY, // COD_SCP
  ]);
}

export interface Reg0010Input {
  formaTrib?: string; // '5' Lucro Presumido (default)
  formaApur?: string; // 'T' Trimestral (default)
  codQualifPj?: string; // '01' PJ em Geral (default)
  formaTribPer?: string; // 'PPPP' 4 trimestres Presumido (default)
  tipEscPre?: string; // 'C' obrigada/facultativa à ECD com recuperação (default)
  indRecReceita?: string; // '2' Regime de Competência (default — mantém ECD)
  optRefis?: string; // 'N' (default)
}

/**
 * 0010 — Parâmetros de Tributação (13 campos). Manual pp. 70-79. Ordem (exemplo
 * p. 79): REG, HASH_ECF_ANTERIOR, OPT_REFIS, FORMA_TRIB, FORMA_APUR,
 * COD_QUALIF_PJ, FORMA_TRIB_PER, MES_BAL_RED, TIP_ESC_PRE, TIP_ENT, FORMA_APUR_I,
 * APUR_CSLL, IND_REC_RECEITA. HASH_ECF_ANTERIOR é preenchido pelo sistema (só
 * Lucro Real) ⇒ vazio p/ Presumido. MES_BAL_RED vazio quando FORMA_APUR='T'
 * (REGRA_NAO_PREENCHER_TRIMESTRAL). TIP_ENT/FORMA_APUR_I/APUR_CSLL só p/
 * imunes/isentas ⇒ vazios. FORMA_TRIB='5' (Presumido), FORMA_APUR='T',
 * COD_QUALIF_PJ='01' (REGRA_COD_QUALIF_PJ), FORMA_TRIB_PER='PPPP'
 * (REGRA_PRESUMIDO_PRIMEIRO), TIP_ESC_PRE='C'.
 */
export function build0010(i: Reg0010Input = {}): string {
  return spedLine([
    '0010',
    EMPTY, // HASH_ECF_ANTERIOR (sistema; Lucro Real)
    i.optRefis ?? 'N',
    i.formaTrib ?? '5',
    i.formaApur ?? 'T',
    i.codQualifPj ?? '01',
    i.formaTribPer ?? 'PPPP',
    EMPTY, // MES_BAL_RED (vazio p/ FORMA_APUR='T')
    i.tipEscPre ?? 'C',
    EMPTY, // TIP_ENT (imunes/isentas)
    EMPTY, // FORMA_APUR_I (imunes/isentas)
    EMPTY, // APUR_CSLL (imunes/isentas)
    i.indRecReceita ?? '2',
  ]);
}

export interface Reg0020Input {
  indAliqCsll?: string; // '1' = 9% (default; REGRA: ECF≥2019 ∈ {1,4})
}

/**
 * 0020 — Parâmetros Complementares (32 campos). Manual pp. 80-94. Ordem (exemplo
 * p. 93): REG, IND_ALIQ_CSLL, IND_QTE_SCP, e 27 flags S/N (IND_ADM_FUN_CLU …
 * IND_DEREX), POSSUI_CEBAS, CEBAS. MVP Presumido single-establishment sem
 * exterior/Refis: todos os flags = 'N', IND_QTE_SCP='0', POSSUI_CEBAS='N',
 * CEBAS vazio. IND_ALIQ_CSLL do DTO (default '1' = 9%).
 */
export function build0020(i: Reg0020Input = {}): string {
  const N = 'N';
  return spedLine([
    '0020',
    i.indAliqCsll ?? '1', // IND_ALIQ_CSLL
    '0', // IND_QTE_SCP
    // 27 flags S/N (campos 4-30: IND_ADM_FUN_CLU … IND_DEREX) — todos 'N' no MVP
    N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N,
    N, // POSSUI_CEBAS
    EMPTY, // CEBAS
  ]);
}

export interface Reg0030Input {
  codNat: string; // natureza jurídica (tabela Sped)
  cnaeFiscal: string;
  endereco: string;
  num: string;
  compl?: string;
  bairro: string;
  uf: string;
  codMun: string;
  cep: string;
  numTel?: string;
  email: string;
}

/**
 * 0030 — Dados Cadastrais (12 campos). Manual pp. 100-101. Ordem (exemplo p.
 * 101): REG, COD_NAT, CNAE_FISCAL, ENDERECO, NUM, COMPL, BAIRRO, UF, COD_MUN,
 * CEP, NUM_TEL, EMAIL. COD_NAT/CNAE/UF/COD_MUN de tabelas oficiais (DTO).
 */
export function build0030(i: Reg0030Input): string {
  return spedLine([
    '0030',
    i.codNat,
    i.cnaeFiscal,
    i.endereco,
    i.num,
    i.compl ?? EMPTY,
    i.bairro,
    i.uf,
    i.codMun,
    i.cep,
    i.numTel ?? EMPTY,
    i.email,
  ]);
}

export interface Reg0930Signer {
  identNom: string;
  identCpfCnpj: string; // CPF(11) ou CNPJ(14)
  identQualif: string; // código qualificação (tabela Sped; 900=Contador)
  indCrc?: string; // obrigatório quando identQualif='900'
  email: string;
  fone: string;
}

/**
 * 0930 — Identificação dos Signatários (7 campos, 1:N máx 2). Manual pp. 103-106.
 * Ordem (exemplo p. 106): REG, IDENT_NOM, IDENT_CPF_CNPJ, IDENT_QUALIF, IND_CRC,
 * EMAIL, FONE. REGRA_OBRIGATORIO_ASSIN_CONTADOR: ≥1 linha com QUALIF='900'
 * (CPF 11 dígitos + IND_CRC) e ≥1 com QUALIF≠'900'.
 */
export function build0930(s: Reg0930Signer): string {
  return spedLine([
    '0930',
    s.identNom,
    s.identCpfCnpj,
    s.identQualif,
    s.indCrc ?? EMPTY,
    s.email,
    s.fone,
  ]);
}

// ── Bloco P (Lucro Presumido) ──

/** P030 — Identificação dos períodos de apuração (4 campos). Manual pp. 327-328.
 * Ordem (exemplo p. 328): REG, DT_INI, DT_FIN, PER_APUR (T01..T04). */
export function buildP030(dtIni: string, dtFin: string, perApur: string): string {
  return spedLine(['P030', spedDate(dtIni), spedDate(dtFin), perApur]);
}

/**
 * Linha de receita bruta segregada de P200 / P400 (4 campos): REG, CODIGO,
 * DESCRICAO, VALOR. Manual pp. 339 (P200) / 345 (P400). CODIGO da tabela
 * dinâmica; DESCRICAO é Obrigatório=Não ⇒ emitimos vazio (o PVA preenche pela
 * tabela via CODIGO — evita mismatch de acento/caixa). VALOR = receita bruta em
 * centavos → decimal SPED (sempre ≥ 0, linha `E`).
 */
export function buildPLine(
  reg: 'P200' | 'P400',
  codigo: string,
  valorCents: number,
): string {
  return spedLine([reg, codigo, EMPTY, centsToSpedDecimal(valorCents)]);
}

// ── Bloco 9 ──

/**
 * 9900 — Registros do arquivo (5 campos): REG, REG_BLC, QTD_REG_BLC, VERSAO,
 * ID_TAB_DIN. Manual pp. 615-616. VERSAO e ID_TAB_DIN são NÃO obrigatórios
 * ("preenchido pelo sistema") ⇒ emitidos vazios mesmo p/ registros dinâmicos.
 * Conta uma linha por tipo de registro presente, incluindo 9900/9990/9999
 * (auto-referência), como na ECD.
 */
export function build9900(regBlc: string, qtd: number): string {
  return spedLine(['9900', regBlc, String(qtd), EMPTY, EMPTY]);
}

/** 9999 — Encerramento do arquivo (2 campos): REG, QTD_LIN (total do arquivo).
 * Manual p. 618. */
export function build9999(qtdLin: number): string {
  return spedLine(['9999', String(qtdLin)]);
}

// ─── Montador do arquivo (ordem dos blocos + contadores em 2ª passada) ────────

/** Terminador CRLF por registro (Manual p. 31, ECF-6). */
export const ECF_LINE_TERMINATOR = '\r\n';

/**
 * Junta as linhas no texto final da ECF. Cada registro termina em CRLF,
 * INCLUSIVE o último. O serviço grava como bytes ISO-8859-1 (Latin-1).
 */
export function serializeEcf(lines: string[]): string {
  return lines.map((l) => l + ECF_LINE_TERMINATOR).join('');
}

/** Apuração trimestral: um período P030 + suas linhas de receita bruta. */
export interface EcfQuarter {
  perApur: string; // 'T01'..'T04'
  dtIni: string; // ISO
  dtFin: string; // ISO
  servicoCents: number; // receita bruta de serviços (conta 3.1) no trimestre
  revendaCents: number; // receita bruta de revenda (conta 3.3) no trimestre
}

export interface EcfFileInput {
  declarant: Reg0000Input & Reg0030Input;
  fiscal?: Reg0010Input;
  params?: Reg0020Input;
  signers: Reg0930Signer[]; // ≥1 contador (900) + ≥1 não-contador
  quarters: EcfQuarter[]; // trimestres Presumido (ordenados T01→T04)
}

/**
 * Ordem canônica dos blocos (Manual p. 40-41). Blocos sem dados entram como
 * marcadores vazios (abertura IND_DAD='1' + encerramento). Blocos C/E/J/K/P100/
 * P150 são recuperados/calculados pelo PVA da ECD (0010.TIP_ESC_PRE='C'). Os
 * blocos de outros regimes (L/M/N Real, Q Livro Caixa, T Arbitrado, U Imunes,
 * V DEREX, W País-a-País, X Econômicas) entram vazios pela regra "todos os
 * blocos obrigatórios" (p. 41). Bloco S (TEF/SAF, FORMA_TRIB=10) fica FORA.
 *
 * NB: o conjunto exato de marcadores vazios é o item nº 1 do sign-off humano no
 * PVA-ECF (ADR §Fechamento) — ajustar um marcador é uma linha.
 */
const EMPTY_BLOCKS: Array<{ open: BlockOpenReg; close: BlockCloseReg }> = [
  { open: 'C001', close: 'C990' },
  { open: 'E001', close: 'E990' },
  { open: 'J001', close: 'J990' },
  { open: 'K001', close: 'K990' },
  { open: 'L001', close: 'L990' },
  { open: 'M001', close: 'M990' },
  { open: 'N001', close: 'N990' },
];
const EMPTY_BLOCKS_TAIL: Array<{ open: BlockOpenReg; close: BlockCloseReg }> = [
  { open: 'Q001', close: 'Q990' },
  { open: 'T001', close: 'T990' },
  { open: 'U001', close: 'U990' },
  { open: 'V001', close: 'V990' },
  { open: 'W001', close: 'W990' },
  { open: 'X001', close: 'X990' },
  { open: 'Y001', close: 'Y990' },
];

function emptyBlock(open: BlockOpenReg, close: BlockCloseReg): string[] {
  return [buildBlockOpen(open, false), buildBlockClose(close, 2)];
}

/**
 * Monta a ECF completa (blocos na ordem) e resolve os contadores em 2ª passada:
 *   - encerradores de bloco = linhas do bloco (auto-inclusivo);
 *   - 9900 = uma linha por tipo de registro presente, auto-referente;
 *   - 9999 = total de linhas do arquivo.
 * Determinismo: mesma entrada (já ordenada) ⇒ saída byte-idêntica (asserção
 * sha256 no teste).
 */
export function buildEcfFile(input: EcfFileInput): string[] {
  // ── Bloco 0 (com dados) ──
  const block0: string[] = [];
  block0.push(build0000(input.declarant));
  block0.push(buildBlockOpen('0001', true));
  block0.push(build0010(input.fiscal));
  block0.push(build0020(input.params));
  block0.push(build0030(input.declarant));
  for (const s of input.signers) block0.push(build0930(s));
  block0.push(buildBlockClose('0990', 0)); // patch abaixo
  block0[block0.length - 1] = buildBlockClose('0990', block0.length);

  // ── Blocos recuperados/irrelevantes antes de P (vazios) ──
  const middleEmpty: string[] = [];
  for (const b of EMPTY_BLOCKS) middleEmpty.push(...emptyBlock(b.open, b.close));

  // ── Bloco P (com dados: P030 + receita bruta segregada por trimestre) ──
  const blockP: string[] = [];
  blockP.push(buildBlockOpen('P001', true));
  for (const q of input.quarters) {
    blockP.push(buildP030(q.dtIni, q.dtFin, q.perApur));
    // Linhas `E` de receita bruta — só quando > 0 (ocorrência 0:N).
    if (q.servicoCents > 0) {
      blockP.push(buildPLine('P200', P_LINE.servico.p200, q.servicoCents));
      blockP.push(buildPLine('P400', P_LINE.servico.p400, q.servicoCents));
    }
    if (q.revendaCents > 0) {
      blockP.push(buildPLine('P200', P_LINE.revenda.p200, q.revendaCents));
      blockP.push(buildPLine('P400', P_LINE.revenda.p400, q.revendaCents));
    }
  }
  blockP.push(buildBlockClose('P990', 0));
  blockP[blockP.length - 1] = buildBlockClose('P990', blockP.length);

  // ── Blocos vazios após P ──
  const tailEmpty: string[] = [];
  for (const b of EMPTY_BLOCKS_TAIL) tailEmpty.push(...emptyBlock(b.open, b.close));

  // ── Bloco 9 (contagem) ──
  const preceding = [...block0, ...middleEmpty, ...blockP, ...tailEmpty];
  const nine001 = buildBlockOpen('9001', true);
  const counts = new Map<string, number>();
  for (const line of [...preceding, nine001]) {
    const reg = line.split('|')[1] ?? '';
    counts.set(reg, (counts.get(reg) ?? 0) + 1);
  }
  // Tipos presentes no arquivo final = os já contados + os que o bloco 9 cria.
  const types = new Set<string>([...counts.keys(), '9900', '9990', '9999']);
  counts.set('9900', types.size); // uma 9900 por tipo (auto-referência)
  counts.set('9990', 1);
  counts.set('9999', 1);
  const nine900 = [...types].sort().map((t) => build9900(t, counts.get(t) ?? 0));
  const block9WithoutClosers = [nine001, ...nine900];
  const block9Total = block9WithoutClosers.length + 2; // + 9990 + 9999
  const block9: string[] = [
    ...block9WithoutClosers,
    buildBlockClose('9990', block9Total),
  ];

  // ── Total geral (2ª passada) ──
  const grandTotal = preceding.length + block9.length + 1; // +1 = a própria 9999
  block9.push(build9999(grandTotal));

  return [...preceding, ...block9];
}

/**
 * Self-check executável (ponytail: a lógica de valor/data/contagem deixa um
 * teste que falha se quebrar). Não é framework — asserts + throws.
 */
export function __selfCheck(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`ecf selfCheck: ${msg}`);
  };
  assert(buildP030('2025-01-01', '2025-03-31', 'T01') === '|P030|01012025|31032025|T01|', 'p030');
  assert(buildPLine('P200', '8', 15000000) === '|P200|8||150000,00|', 'p200 servico');
  assert(buildPLine('P400', '2', 5000000) === '|P400|2||50000,00|', 'p400 revenda');
  assert(build9900('P200', 4) === '|9900|P200|4|||', '9900 5-field');
  assert(buildBlockOpen('C001', false) === '|C001|1|', 'empty block open');
  assert(buildBlockOpen('P001', true) === '|P001|0|', 'data block open');
  assert(build0010() === '|0010||N|5|T|01|PPPP||C||||2|', '0010 presumido default');
  // Determinismo: mesma entrada ⇒ mesma saída.
  const input: EcfFileInput = {
    declarant: {
      cnpj: '11111111000191', nome: 'SALAO TESTE',
      dtIni: '2025-01-01', dtFin: '2025-12-31',
      codNat: '2062', cnaeFiscal: '9602501', endereco: 'RUA X', num: '1',
      bairro: 'CENTRO', uf: 'DF', codMun: '5300108', cep: '70000000', email: 'a@b.com',
    },
    signers: [
      { identNom: 'CONTADOR', identCpfCnpj: '12345678900', identQualif: '900', indCrc: '1DF123', email: 'c@d.com', fone: '6133334444' },
      { identNom: 'SOCIO', identCpfCnpj: '98765432100', identQualif: '205', email: 's@d.com', fone: '6133335555' },
    ],
    quarters: [
      { perApur: 'T01', dtIni: '2025-01-01', dtFin: '2025-03-31', servicoCents: 15000000, revendaCents: 5000000 },
    ],
  };
  const a = serializeEcf(buildEcfFile(input));
  const b = serializeEcf(buildEcfFile(input));
  assert(a === b, 'determinismo');
  assert(a.endsWith('\r\n'), 'crlf trailing');
}
