/**
 * SPED ECF (Fiscal · Lucro Presumido) serializer (ADR-INCR-SPED-ECF, FASE 2).
 *
 * Pure, format-critical logic. Pins the manual-ratified rules (Leiaute 12, ADE
 * Cofis 02/2026):
 *  - money reuses the ECD primitive: comma-decimal, NO thousands sep, no float;
 *  - date YYYY-MM-DD -> DDMMYYYY by literal slice (no UTC day-shift);
 *  - Luminaris emits ONLY receita-bruta `E`-lines (P200/P400); the PVA computes
 *    every presunção/tax line (ADR D2 invertido) — no tax math here;
 *  - block open carries IND_DAD ('0' com dados / '1' vazio);
 *  - 9900 is 5-field (VERSAO/ID_TAB_DIN empty); counting is self-referential;
 *  - same input -> byte-identical file (sha256 pin).
 */
import { createHash } from 'crypto';
import {
  buildBlockOpen,
  buildBlockClose,
  buildP030,
  buildPLine,
  build9900,
  build0010,
  build0020,
  buildEcfFile,
  serializeEcf,
  __selfCheck,
  P_LINE,
  ECF_COD_VER,
  type EcfFileInput,
} from '../ecf';

const sampleInput = (): EcfFileInput => ({
  declarant: {
    cnpj: '11111111000191',
    nome: 'SALAO TESTE LTDA',
    dtIni: '2025-01-01',
    dtFin: '2025-12-31',
    codNat: '2062',
    cnaeFiscal: '9602501',
    endereco: 'RUA DAS FLORES',
    num: '100',
    bairro: 'CENTRO',
    uf: 'DF',
    codMun: '5300108',
    cep: '70000000',
    numTel: '6133334444',
    email: 'salao@teste.com',
  },
  signers: [
    { identNom: 'CONTADOR TESTE', identCpfCnpj: '12345678900', identQualif: '900', indCrc: '1DF123456', email: 'contador@teste.com', fone: '6133334444' },
    { identNom: 'SOCIO TESTE', identCpfCnpj: '98765432100', identQualif: '205', email: 'socio@teste.com', fone: '6133335555' },
  ],
  quarters: [
    { perApur: 'T01', dtIni: '2025-01-01', dtFin: '2025-03-31', servicoCents: 15000000, revendaCents: 5000000 },
    { perApur: 'T02', dtIni: '2025-04-01', dtFin: '2025-06-30', servicoCents: 18000000, revendaCents: 0 },
    { perApur: 'T03', dtIni: '2025-07-01', dtFin: '2025-09-30', servicoCents: 20000000, revendaCents: 7000000 },
    { perApur: 'T04', dtIni: '2025-10-01', dtFin: '2025-12-31', servicoCents: 22000000, revendaCents: 8000000 },
  ],
});

describe('ecf serializer — self-check', () => {
  it('__selfCheck passes', () => {
    expect(() => __selfCheck()).not.toThrow();
  });
});

describe('ecf primitives', () => {
  it('P030 emits the trimester period, dates by literal slice', () => {
    expect(buildP030('2025-01-01', '2025-03-31', 'T01')).toBe('|P030|01012025|31032025|T01|');
  });

  it('P200/P400 receita-bruta lines: REG|CODIGO|(desc vazia)|VALOR, no float', () => {
    // 320.055,99 → integer cents, comma decimal, no thousands sep.
    expect(buildPLine('P200', '8', 32005599)).toBe('|P200|8||320055,99|');
    expect(buildPLine('P400', '2', 100)).toBe('|P400|2||1,00|');
  });

  it('activity→line map segregates 3.1 (serviço) vs 3.3 (revenda)', () => {
    expect(P_LINE.servico).toEqual({ p200: '8', p400: '4' }); // 32% IRPJ & 32% CSLL
    expect(P_LINE.revenda).toEqual({ p200: '4', p400: '2' }); // 8% IRPJ & 12% CSLL
  });

  it('9900 is 5-field with empty VERSAO/ID_TAB_DIN', () => {
    expect(build9900('P200', 4)).toBe('|9900|P200|4|||');
  });

  it('block open carries IND_DAD; empty block = 1, data block = 0', () => {
    expect(buildBlockOpen('C001', false)).toBe('|C001|1|');
    expect(buildBlockOpen('P001', true)).toBe('|P001|0|');
    expect(buildBlockClose('P990', 7)).toBe('|P990|7|');
  });

  it('0010 defaults to Lucro Presumido trimestral, TIP_ESC_PRE=C', () => {
    // REG|HASH|OPT_REFIS|FORMA_TRIB(5)|FORMA_APUR(T)|COD_QUALIF(01)|FORMA_TRIB_PER(PPPP)|MES_BAL_RED|TIP_ESC_PRE(C)|TIP_ENT|FORMA_APUR_I|APUR_CSLL|IND_REC_RECEITA(2)
    expect(build0010()).toBe('|0010||N|5|T|01|PPPP||C||||2|');
  });

  it('0020 defaults to IND_ALIQ_CSLL=1 (9%), all flags N, CEBAS empty', () => {
    const line = build0020();
    expect(line.startsWith('|0020|1|0|')).toBe(true);
    expect(line.endsWith('|N||')).toBe(true); // POSSUI_CEBAS=N, CEBAS empty
    // 32 fields → 33 pipes.
    expect(line.split('|').length).toBe(34);
  });

  it('COD_VER is 0012 (leiaute 12)', () => {
    expect(ECF_COD_VER).toBe('0012');
  });
});

describe('ecf file assembler', () => {
  it('is byte-deterministic (same input → same sha256)', () => {
    const a = serializeEcf(buildEcfFile(sampleInput()));
    const b = serializeEcf(buildEcfFile(sampleInput()));
    expect(sha(a)).toBe(sha(b));
  });

  it('ends every line with CRLF, including the last', () => {
    const out = serializeEcf(buildEcfFile(sampleInput()));
    expect(out.endsWith('\r\n')).toBe(true);
    for (const line of out.split('\r\n').filter(Boolean)) {
      expect(line.startsWith('|')).toBe(true);
      expect(line.endsWith('|')).toBe(true);
    }
  });

  it('emits 0000 first and 9999 last, in canonical block order', () => {
    const lines = buildEcfFile(sampleInput());
    expect(lines[0].startsWith('|0000|')).toBe(true);
    expect(lines[lines.length - 1].startsWith('|9999|')).toBe(true);
    const regs = lines.map((l) => l.split('|')[1]);
    // canonical order of block openers
    const openers = regs.filter((r) => /^(0001|C001|E001|J001|K001|L001|M001|N001|P001|Q001|S001|T001|U001|V001|W001|X001|Y001|9001)$/.test(r));
    expect(openers).toEqual([
      '0001', 'C001', 'E001', 'J001', 'K001', 'L001', 'M001', 'N001',
      'P001', 'Q001', 'S001', 'T001', 'U001', 'V001', 'W001', 'X001', 'Y001', '9001',
    ]);
  });

  it('recovered/irrelevant blocks are empty markers (IND_DAD=1, close qty 2)', () => {
    const lines = buildEcfFile(sampleInput());
    for (const b of ['C', 'E', 'J', 'K', 'L', 'M', 'N', 'Q', 'S', 'T', 'U', 'V', 'W', 'X', 'Y']) {
      expect(lines).toContain(`|${b}001|1|`);
      expect(lines).toContain(`|${b}990|2|`);
    }
  });

  it('segregates receita bruta per trimester: 3.1→P200(8)/P400(4), 3.3→P200(4)/P400(2)', () => {
    const lines = buildEcfFile(sampleInput());
    // T01 serviço 150.000,00 and revenda 50.000,00
    expect(lines).toContain('|P200|8||150000,00|'); // serviço IRPJ 32%
    expect(lines).toContain('|P400|4||150000,00|'); // serviço CSLL 32%
    expect(lines).toContain('|P200|4||50000,00|'); // revenda IRPJ 8%
    expect(lines).toContain('|P400|2||50000,00|'); // revenda CSLL 12%
  });

  it('omits receita lines when the activity has zero movement (0:N)', () => {
    const lines = buildEcfFile(sampleInput());
    const t02Idx = lines.indexOf('|P030|01042025|30062025|T02|');
    const t03Idx = lines.indexOf('|P030|01072025|30092025|T03|');
    const t02Block = lines.slice(t02Idx, t03Idx);
    // T02 has revenda=0 → no revenda lines (P200(4)/P400(2)) in this period.
    expect(t02Block.some((l) => l === '|P200|4||0,00|')).toBe(false);
    expect(t02Block.some((l) => l.startsWith('|P200|8|'))).toBe(true); // serviço present
  });

  it('9900 counts every register type present, self-referentially', () => {
    const lines = buildEcfFile(sampleInput());
    const total = lines.length;
    // 9999 records the grand total (self-inclusive).
    expect(lines[lines.length - 1]).toBe(`|9999|${total}|`);
    // 9900 for 0000 must exist and equal 1.
    expect(lines).toContain('|9900|0000|1|||');
    // block-close counters are consistent: P990 count == lines in block P.
    const p001 = lines.indexOf('|P001|0|');
    const p990Line = lines.find((l) => l.startsWith('|P990|'))!;
    const p990Count = Number(p990Line.split('|')[2]);
    const p990Idx = lines.indexOf(p990Line);
    expect(p990Count).toBe(p990Idx - p001 + 1);
  });
});

function sha(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'latin1')).digest('hex');
}
